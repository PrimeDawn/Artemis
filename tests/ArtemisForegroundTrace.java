import com.sun.jdi.*;
import com.sun.jdi.connect.*;
import com.sun.jdi.event.*;
import com.sun.jdi.request.*;
import java.util.*;

/** Observe real lifecycle method entry/exit. Never invokes or writes App methods. */
public class ArtemisForegroundTrace {
  static final Set<String> METHODS = Set.of("setForeground", "onStart", "onStop", "onResume", "syncAvailability", "onDestroy");
  static void record(VirtualMachine vm, ThreadReference thread, Method method, boolean entry) throws Exception {
    Map<String,Object> out = new LinkedHashMap<>();
    out.put("at",java.time.Instant.now().toString());out.put("entry",entry);out.put("method",method.declaringType().name()+"."+method.name());
    StackFrame frame=thread.frame(0);ObjectReference self=frame.thisObject();
    out.put("objectId",self==null?null:self.uniqueID());
    if(entry&&method.name().equals("setForeground"))try{List<Value> values=frame.getArgumentValues();if(!values.isEmpty())out.put("requestedForeground",ArtemisRuntimeSnapshot.scalar(values.get(0)));}catch(InconsistentDebugInfoException ignored){out.put("argumentMetadata","Unavailable on ART; read actual value at method exit");}
    out.put("thisVisible",ArtemisRuntimeSnapshot.scalar(ArtemisRuntimeSnapshot.field(self,"visible")));
    out.put("thisResumed",ArtemisRuntimeSnapshot.scalar(ArtemisRuntimeSnapshot.field(self,"mResumed")));
    ReferenceType type=vm.classesByName("android.app.ActivityThread").get(0);
    ObjectReference activityThread=ArtemisRuntimeSnapshot.ref(type.getValue(type.fieldByName("sCurrentActivityThread")));
    ObjectReference app=ArtemisRuntimeSnapshot.ref(ArtemisRuntimeSnapshot.field(activityThread,"mInitialApplication"));
    ObjectReference atomic=ArtemisRuntimeSnapshot.ref(ArtemisRuntimeSnapshot.field(app,"foreground"));
    out.put("applicationForeground",ArtemisRuntimeSnapshot.scalar(ArtemisRuntimeSnapshot.field(atomic,"value")));
    ObjectReference activities=ArtemisRuntimeSnapshot.ref(ArtemisRuntimeSnapshot.field(activityThread,"mActivities"));Value records=ArtemisRuntimeSnapshot.field(activities,"mArray");
    if(records instanceof ArrayReference){StringJoiner list=new StringJoiner(";");List<Value> values=((ArrayReference)records).getValues();for(int i=1;i<values.size();i+=2){ObjectReference activity=ArtemisRuntimeSnapshot.ref(ArtemisRuntimeSnapshot.field(ArtemisRuntimeSnapshot.ref(values.get(i)),"activity"));if(activity!=null&&activity.referenceType().name().equals("io.github.primedawn.artemis.MainActivity"))list.add(activity.uniqueID()+":visible="+ArtemisRuntimeSnapshot.scalar(ArtemisRuntimeSnapshot.field(activity,"visible"))+",resumed="+ArtemisRuntimeSnapshot.scalar(ArtemisRuntimeSnapshot.field(activity,"mResumed"))+",stopped="+ArtemisRuntimeSnapshot.scalar(ArtemisRuntimeSnapshot.field(activity,"mStopped")));}out.put("activities",list.toString());}
    StringJoiner stack=new StringJoiner("\n");int n=0;for(StackFrame item:thread.frames()){if(n++>=10)break;stack.add(item.location().declaringType().name()+"."+item.location().method().name()+":"+item.location().lineNumber());}out.put("stack",stack.toString());
    StringJoiner json=new StringJoiner(",","{","}");for(var item:out.entrySet())json.add(ArtemisRuntimeSnapshot.json(item.getKey())+":"+ArtemisRuntimeSnapshot.json(item.getValue()));System.out.println(json);System.out.flush();
  }
  public static void main(String[] args) throws Exception {
    AttachingConnector connector=Bootstrap.virtualMachineManager().attachingConnectors().stream().filter(x->x.name().endsWith("SocketAttach")).findFirst().orElseThrow();
    var arguments=connector.defaultArguments();arguments.get("hostname").setValue("127.0.0.1");arguments.get("port").setValue(args[0]);arguments.get("timeout").setValue("3000");VirtualMachine vm=connector.attach(arguments);
    long end=System.nanoTime()+Math.min(45000,Long.parseLong(args[1]))*1000000;
    try {
      for(String name:List.of("io.github.primedawn.artemis.MainActivity","io.github.primedawn.artemis.ArtemisApplication")){
        MethodEntryRequest entry=vm.eventRequestManager().createMethodEntryRequest();entry.addClassFilter(name);entry.setSuspendPolicy(EventRequest.SUSPEND_EVENT_THREAD);entry.enable();
        MethodExitRequest exit=vm.eventRequestManager().createMethodExitRequest();exit.addClassFilter(name);exit.setSuspendPolicy(EventRequest.SUSPEND_EVENT_THREAD);exit.enable();
      }
      System.out.println("{\"event\":\"trace-ready\"}");System.out.flush();boolean disconnected=false;
      while(!disconnected&&System.nanoTime()<end){EventSet events=vm.eventQueue().remove(250);if(events==null)continue;try{
        for(Event event:events)try{if(event instanceof MethodEntryEvent e&&METHODS.contains(e.method().name()))record(vm,e.thread(),e.method(),true);else if(event instanceof MethodExitEvent e&&METHODS.contains(e.method().name()))record(vm,e.thread(),e.method(),false);else if(event instanceof VMDisconnectEvent||event instanceof VMDeathEvent)disconnected=true;}catch(RuntimeException failure){System.out.println("{\"event\":\"trace-record-error\",\"type\":"+ArtemisRuntimeSnapshot.json(failure.getClass().getName())+"}");System.out.flush();}
      }finally{events.resume();}}
    }finally{try{vm.dispose();}catch(VMDisconnectedException ignored){}}
  }
}
