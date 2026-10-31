package io.github.primedawn.artemis.pairing
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.HttpUrl
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okhttp3.Response
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.UUID
import javax.net.ssl.SSLException
interface DeviceClient {
    fun open(pc: DiscoveredPc, onEvent: (ServerEvent) -> Unit, onFailure: (String) -> Unit)
    fun decide(requestId: String, allow: Boolean)
    fun send(signal: ClientSignal): Result<Unit>
    fun disconnectPeer(pcId: String)
    fun requestEnrollment(pcId: String)
    fun closePeer(pcId: String)
    fun close()
}
class OkHttpDeviceClient(private val identity: DeviceIdentity) : DeviceClient {
    private class SocketState(val pc:DiscoveredPc,val client:OkHttpClient,val event:(ServerEvent)->Unit,val failure:(String)->Unit) {
        @Volatile var localClose=false;val failed=AtomicBoolean(false);@Volatile var socket:WebSocket?=null
        @Volatile var opened=false
        @Volatile var challenge:ServerEvent.Challenge?=null;@Volatile var approval:ServerEvent.Approval?=null
        @Volatile var session:String?=null;@Volatile var epoch:String?=null
    }
    private val sockets=ConcurrentHashMap<String,SocketState>()
    override fun open(pc:DiscoveredPc,onEvent:(ServerEvent)->Unit,onFailure:(String)->Unit) {
        closePeer(pc.peer.id)
        try {
            require(sockets.size<8);val state=SocketState(pc,pinnedClient(pc),onEvent,onFailure);sockets[pc.peer.id]=state
            val url=HttpUrl.Builder().scheme("https").host(requireNotNull(pc.address.hostAddress)).port(pc.port).addPathSegments("v2/device").build()
            state.socket=state.client.newWebSocket(Request.Builder().url(url).build(),object:WebSocketListener(){
                override fun onOpen(webSocket:WebSocket,response:Response){state.socket=webSocket;state.opened=true;if(state.localClose){webSocket.close(1000,"");return};webSocket.send(JSONObject().put("v",2).put("kind","hello").put("device",WireCodec.peerJson(identity.peer())).toString())}
                override fun onMessage(webSocket:WebSocket,text:String){try{receive(state,text)}catch(_:Exception){fail(state,"E_PROTOCOL");webSocket.close(1008,"invalid message")}}
                override fun onMessage(webSocket:WebSocket,bytes:okio.ByteString){fail(state,"E_PROTOCOL");webSocket.close(1008,"text required")}
                override fun onClosing(webSocket:WebSocket,code:Int,reason:String){webSocket.close(code,"")}
                override fun onClosed(webSocket:WebSocket,code:Int,reason:String){fail(state,if(code==4001)"E_NOT_TRUSTED" else "E_NETWORK")}
                override fun onFailure(webSocket:WebSocket,t:Throwable,response:Response?){fail(state,if(t is SSLException)"E_TLS_IDENTITY" else "E_NETWORK")}
            })
        } catch(_:Exception){onFailure("E_NETWORK")}
    }
    private fun fail(state:SocketState,code:String){
        if(state.failed.compareAndSet(false,true)) {
            sockets.remove(state.pc.peer.id,state)
            state.client.connectionPool.evictAll()
            state.client.dispatcher.executorService.shutdown()
            if(!state.localClose) state.failure(code)
        }
    }
    private fun string(m:JSONObject,name:String)=WireCodec.text(m,name)
    private fun uuid(value:String):String { require(value.matches(Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")));return value }
    private fun receive(s:SocketState,text:String) {
        if(s.localClose)return;require(text.toByteArray(Charsets.UTF_8).size<=65536)
        val m=JSONObject(text);require(m.get("v")==2)
        when(string(m,"kind")) {
            "challenge"->{
                WireCodec.exact(m,"v","kind","pc","challengeId","connectionId","nonce","expiresAt","signature");require(s.challenge==null)
                val pc=WireCodec.peer(m.getJSONObject("pc"));require(pc.id==s.pc.peer.id&&pc.publicKeySpki.contentEquals(s.pc.peer.publicKeySpki))
                val challenge=ServerEvent.Challenge(pc,uuid(string(m,"challengeId")),uuid(string(m,"connectionId")),string(m,"nonce"),m.getLong("expiresAt"),string(m,"signature"));require(WireCodec.decode(challenge.nonce,32).size==32)
                require(WireCodec.verify(pc,WireCodec.canonical("challenge",pc.id,identity.peer().id,challenge.challengeId,challenge.nonce,challenge.connectionId,"challenge"),challenge.signature))
                s.challenge=challenge;val proof=identity.sign(WireCodec.canonical("proof",pc.id,identity.peer().id,challenge.challengeId,challenge.nonce,challenge.connectionId,"proof"))
                sendControl(s,JSONObject().put("v",2).put("kind","proof").put("deviceId",identity.peer().id).put("challengeId",challenge.challengeId).put("connectionId",challenge.connectionId).put("signature",WireCodec.encode(proof)));s.event(challenge)
            }
            "enroll-request"->{WireCodec.exact(m,"v","kind","pcId","deviceId","requestId","nonce");require(s.challenge!=null&&string(m,"pcId")==s.pc.peer.id&&string(m,"deviceId")==identity.peer().id);val nonce=string(m,"nonce");require(WireCodec.decode(nonce,32).size==32);val event=ServerEvent.Approval(s.pc.peer,uuid(string(m,"requestId")),nonce);s.approval=event;s.event(event)}
            "trusted"->{WireCodec.exact(m,"v","kind","pcId");require(string(m,"pcId")==s.pc.peer.id);s.approval=null;s.event(ServerEvent.Trusted(s.pc.peer.id))}
            "activated"->{WireCodec.exact(m,"v","kind","manual");require(s.challenge!=null&&m.get("manual") is Boolean);s.event(ServerEvent.Activated(m.getBoolean("manual")))}
            "waiting","ready"->{WireCodec.exact(m,"v","kind","sessionId","epoch");require(s.challenge!=null);s.session=if(m.isNull("sessionId"))null else uuid(string(m,"sessionId"));s.epoch=if(m.isNull("epoch"))null else uuid(string(m,"epoch"));require(s.epoch==null||s.session!=null);s.event(ServerEvent.Session(string(m,"kind"),s.session,s.epoch))}
            "signal"->{WireCodec.exact(m,"v","kind","signal");val signal=parseSignal(m.getJSONObject("signal"));require(signalSession(signal)==s.session&&signalEpoch(signal)==s.epoch&&s.epoch!=null);s.event(ServerEvent.Signal(signal))}
            "revoked"->{WireCodec.exact(m,"v","kind");s.event(ServerEvent.Revoked)}
            "denied"->{WireCodec.exact(m,"v","kind");s.approval=null;s.event(ServerEvent.Denied)}
            "error"->{WireCodec.exact(m,"v","kind","code","requestId");val code=string(m,"code");require(code.matches(Regex("^E_[A-Z_]+$")));s.event(ServerEvent.Failure(code,uuid(string(m,"requestId"))))}
            else->throw IllegalArgumentException("E_PROTOCOL")
        }
    }
    override fun decide(requestId:String,allow:Boolean) {
        val s=sockets.values.firstOrNull{it.approval?.requestId==requestId}?:return;val approval=s.approval?:return;val challenge=s.challenge?:return
        val sig=identity.sign(WireCodec.canonical("enroll-decision",s.pc.peer.id,identity.peer().id,requestId,approval.nonce,challenge.connectionId,if(allow)"allow" else "deny"))
        sendControl(s,JSONObject().put("v",2).put("kind","enroll-decision").put("pcId",s.pc.peer.id).put("deviceId",identity.peer().id).put("requestId",requestId).put("nonce",approval.nonce).put("allow",allow).put("signature",WireCodec.encode(sig)));s.approval=null
    }
    private fun sendControl(s:SocketState,value:JSONObject){if(s.socket?.send(value.toString())!=true)fail(s,"E_NETWORK")}
    override fun disconnectPeer(pcId:String){sockets[pcId]?.let{sendControl(it,JSONObject().put("v",2).put("kind","disconnect"));it.session=null;it.epoch=null}}
    override fun requestEnrollment(pcId:String){sockets[pcId]?.let{sendControl(it,JSONObject().put("v",2).put("kind","request-enrollment"))}}
    override fun send(signal:ClientSignal):Result<Unit> = runCatching {
        val s=sockets.values.firstOrNull{it.session==signalSession(signal)&&it.epoch==signalEpoch(signal)&&it.epoch!=null}?:throw IllegalStateException("E_NOT_CONNECTED")
        val m=signalJson(signal);require(m.toString().toByteArray().size<=65536);if(s.socket?.send(m.toString())!=true)throw IllegalStateException("E_NETWORK")
    }
    private fun signalSession(s:ClientSignal)=when(s){is ClientSignal.Description->s.sessionId;is ClientSignal.Candidate->s.sessionId;is ClientSignal.Bye->s.sessionId}
    private fun signalEpoch(s:ClientSignal)=when(s){is ClientSignal.Description->s.epoch;is ClientSignal.Candidate->s.epoch;is ClientSignal.Bye->s.epoch}
    private fun signalJson(s:ClientSignal):JSONObject {
        val m=JSONObject().put("v",2).put("sessionId",uuid(signalSession(s))).put("epoch",uuid(signalEpoch(s)))
        when(s){
            is ClientSignal.Description->{require(s.type=="offer"&&s.sdp.isNotEmpty()&&s.sdp.toByteArray().size<=32768);m.put("id",uuid(s.id)).put("kind",s.type).put("payload",JSONObject().put("type",s.type).put("sdp",s.sdp))}
            is ClientSignal.Candidate->{require(s.candidate==null||s.candidate.toByteArray().size<=2048);require(s.sdpMid==null||s.sdpMid.length<=256);require(s.sdpMLineIndex==null||s.sdpMLineIndex>=0);m.put("id",uuid(s.id)).put("kind","ice-candidate").put("payload",JSONObject().put("candidate",s.candidate?:JSONObject.NULL).put("sdpMid",s.sdpMid?:JSONObject.NULL).put("sdpMLineIndex",s.sdpMLineIndex?:JSONObject.NULL))}
            is ClientSignal.Bye->{require(s.reason in setOf("user","disconnect"));m.put("id",uuid(s.id)).put("kind","bye").put("payload",JSONObject().put("reason",s.reason))}
        };return m
    }
    private fun parseSignal(m:JSONObject):ClientSignal {
        WireCodec.exact(m,"v","id","sessionId","epoch","kind","payload");require(m.get("v")==2);val id=uuid(string(m,"id"));val session=uuid(string(m,"sessionId"));val epoch=uuid(string(m,"epoch"));val payload=m.getJSONObject("payload")
        return when(string(m,"kind")){
            "answer"->{WireCodec.exact(payload,"type","sdp");require(string(payload,"type")=="answer");val sdp=string(payload,"sdp");require(sdp.isNotEmpty()&&sdp.toByteArray().size<=32768);ClientSignal.Description(id,session,epoch,"answer",sdp)}
            "ice-candidate"->{WireCodec.exact(payload,"candidate","sdpMid","sdpMLineIndex");val c=if(payload.isNull("candidate"))null else string(payload,"candidate");val mid=if(payload.isNull("sdpMid"))null else string(payload,"sdpMid");val index=if(payload.isNull("sdpMLineIndex"))null else (payload.get("sdpMLineIndex") as? Int?:throw IllegalArgumentException("E_INPUT"));require(c==null||c.toByteArray().size<=2048);require(mid==null||mid.length<=256);require(index==null||index>=0);ClientSignal.Candidate(id,session,epoch,c,mid,index)}
            "bye"->{WireCodec.exact(payload,"reason");val reason=string(payload,"reason");require(reason in setOf("user","disconnect"));ClientSignal.Bye(id,session,epoch,reason)}
            else->throw IllegalArgumentException("E_PROTOCOL")
        }
    }
    override fun closePeer(pcId:String){sockets.remove(pcId)?.let{
        it.localClose=true
        // 修复: debugger/debug-003.html. Let the queued Close frame reach the PC;
        // onClosed/onFailure releases this client's resources.
        if(it.opened) it.socket?.close(1000,"") else it.socket?.cancel()
    }}
    override fun close(){sockets.keys.toList().forEach(::closePeer)}
}
