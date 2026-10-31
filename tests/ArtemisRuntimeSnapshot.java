import com.sun.jdi.*;
import com.sun.jdi.connect.*;
import java.util.*;

/** Reads only the owned debug App's fields through JDWP; invokes no App methods. */
public class ArtemisRuntimeSnapshot {
  static Map<String,Object> out = new LinkedHashMap<>();
  static Value field(ObjectReference o,String n) { if(o==null)return null;Field f=o.referenceType().fieldByName(n);return f==null?null:o.getValue(f); }
  static ObjectReference ref(Value v) { return v instanceof ObjectReference?(ObjectReference)v:null; }
  static Object scalar(Value v) { if(v==null)return null;if(v instanceof BooleanValue)return ((BooleanValue)v).value();if(v instanceof IntegerValue)return ((IntegerValue)v).value();if(v instanceof StringReference)return ((StringReference)v).value();return v.type().name(); }
  static void props(String prefix,ObjectReference o,String... names) { for(String n:names)out.put(prefix+n,scalar(field(o,n))); }
  static void size(String prefix,ObjectReference o) { Value v=field(o,"size");if(v==null)v=field(ref(field(o,"map")),"size");out.put(prefix,scalar(v)); }
  static Value value(ObjectReference o,String a,String b) { Value v=field(o,a);return v==null?field(o,b):v; }
  static void peer(String prefix,ObjectReference pc) {
    props(prefix,pc,"port");props(prefix+"identity.",ref(field(pc,"peer")),"id","label");
    ObjectReference address=ref(field(pc,"address")),holder=ref(field(address,"holder"));Value ip=field(holder,"address");out.put(prefix+"addressRaw",scalar(ip));
    if(ip instanceof IntegerValue){int n=((IntegerValue)ip).value();out.put(prefix+"address",((n>>>24)&255)+"."+((n>>>16)&255)+"."+((n>>>8)&255)+"."+(n&255));}
  }
  static void entries(String prefix,ObjectReference map,boolean sockets) {
    Value table=field(map,"table");if(!(table instanceof ArrayReference))return;int i=0;
    for(Value bucket:((ArrayReference)table).getValues())for(ObjectReference node=ref(bucket);node!=null&&i<8;node=ref(field(node,"next"))){
      String p=prefix+(i++)+".";out.put(p+"key",scalar(field(node,"key")));ObjectReference v=ref(value(node,"value","val"));
      if(sockets){peer(p+"pc.",ref(field(v,"pc")));props(p,v,"localClose","session");out.put(p+"challengePresent",field(v,"challenge")!=null);props(p+"websocket.",ref(field(v,"socket")),"failed","awaitingPong","receivedCloseCode");}
      else peer(p,v);
    }
  }
  static String json(Object v) { if(v==null)return "null";if(v instanceof Boolean||v instanceof Number)return v.toString();return "\""+v.toString().replace("\\","\\\\").replace("\"","\\\"").replace("\n","\\n").replace("\r","\\r")+"\""; }
  public static void main(String[] args) throws Exception {
    AttachingConnector c=Bootstrap.virtualMachineManager().attachingConnectors().stream().filter(x->x.name().endsWith("SocketAttach")).findFirst().orElseThrow();
    Map<String,Connector.Argument> a=c.defaultArguments();a.get("hostname").setValue("127.0.0.1");a.get("port").setValue(args[0]);a.get("timeout").setValue("3000");VirtualMachine vm=c.attach(a);
    boolean suspended=false;
    try {
      vm.suspend();suspended=true;
      ReferenceType t=vm.classesByName("android.app.ActivityThread").get(0);
      ObjectReference thread=ref(t.getValue(t.fieldByName("sCurrentActivityThread")));
      ObjectReference app=ref(field(thread,"mInitialApplication"));out.put("applicationClass",app.referenceType().name());
      props("application.foreground.",ref(field(app,"foreground")),"value");
      ObjectReference activities=ref(field(thread,"mActivities"));Value records=field(activities,"mArray");
      if(records instanceof ArrayReference){int i=0;List<Value> values=((ArrayReference)records).getValues();for(int n=1;n<values.size()&&i<8;n+=2){ObjectReference activity=ref(field(ref(values.get(n)),"activity"));if(activity!=null&&activity.referenceType().name().equals("io.github.primedawn.artemis.MainActivity")){String prefix="activity."+(i++)+".";out.put(prefix+"objectId",activity.uniqueID());props(prefix,activity,"visible","mResumed","mStopped","mFinished","mDestroyed");props(prefix+"window.",ref(field(ref(field(activity,"mWindow")),"mWindowAttributes")),"flags");}}}
      ObjectReference controller=ref(field(app,"controller")),discovery=ref(field(app,"discovery"));
      props("controller.",controller,"foreground","started","disposed","activePc","availablePc");
      for(String n:new String[]{"candidates","opening","retries","activated"})size("controller."+n+"Count",ref(field(controller,n)));
      entries("candidate.",ref(field(controller,"candidates")),false);
      entries("socket.",ref(field(ref(field(controller,"client")),"sockets")),true);
      props("discovery.",discovery,"foreground","closed","generation","resolving");out.put("discovery.listenerPresent",field(discovery,"listener")!=null);size("discovery.queueSize",ref(field(discovery,"queue")));size("discovery.namesCount",ref(field(discovery,"names")));
      ObjectReference queue=ref(field(discovery,"queue"));Value array=field(queue,"elementData");if(array instanceof ArrayReference){int i=0;for(Value v:((ArrayReference)array).getValues()){ObjectReference info=ref(v);if(info!=null&&i<3){props("queue."+(i++)+".",info,"mServiceName","mServiceType","mPort");}}}
      for(ThreadReference threadRef:vm.allThreads())if(threadRef.name().toLowerCase().matches(".*(okhttp|artemis).*"))try{StringJoiner stack=new StringJoiner("\n");int count=0;for(StackFrame f:threadRef.frames()){if(count++>=24)break;stack.add(f.location().declaringType().name()+"."+f.location().method().name()+":"+f.location().lineNumber());}out.put("thread."+threadRef.name(),stack.toString());}catch(IncompatibleThreadStateException ignored){}
      StringJoiner j=new StringJoiner(",","{","}");for(var e:out.entrySet())j.add(json(e.getKey())+":"+json(e.getValue()));System.out.println(j);
    } finally { if(suspended)vm.resume();vm.dispose(); }
  }
}
