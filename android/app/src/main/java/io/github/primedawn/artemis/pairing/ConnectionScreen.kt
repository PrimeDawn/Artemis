package io.github.primedawn.artemis.pairing

import androidx.compose.runtime.Composable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable fun ConnectionScreen(state:ConnectionUiState,onApprove:(String,Boolean)->Unit,onDisconnect:()->Unit,onForget:()->Unit,audioNote:String?=null,onRequestMic:(()->Unit)?=null) {
    val title=when(state.status){
        ConnectionStatus.PAUSED->"连接已暂停，回到 App 后恢复"
        ConnectionStatus.DISCOVERING->"正在发现局域网电脑"
        ConnectionStatus.AVAILABLE->"等待电脑选择这台手机"
        ConnectionStatus.AWAITING_APPROVAL->"首次连接确认"
        ConnectionStatus.CONNECTING->"正在建立连接"
        ConnectionStatus.CONNECTED->"已连接"
        ConnectionStatus.RECONNECTING->"连接中断，正在自动恢复"
        ConnectionStatus.BUSY->"手机正在连接另一台电脑"
        ConnectionStatus.IDENTITY_CHANGED->"电脑身份发生变化"
        ConnectionStatus.ERROR->"暂时无法连接"
    }
    Column(modifier=Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).verticalScroll(rememberScrollState()).padding(24.dp),verticalArrangement=Arrangement.spacedBy(20.dp)) {
        Text("Artemis",style=MaterialTheme.typography.labelLarge,color=MaterialTheme.colorScheme.primary)
        Text("设备连接",style=MaterialTheme.typography.headlineLarge)
        Text("在电脑控制页选择这台手机。首次允许一次，以后免配对。",style=MaterialTheme.typography.bodyLarge)
        ElevatedCard(modifier=Modifier.fillMaxWidth()) {
            Column(Modifier.padding(24.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
                Text(title,style=MaterialTheme.typography.titleLarge)
                state.pcLabel?.let { Text("电脑：$it",style=MaterialTheme.typography.bodyLarge) }
                Text(if(state.status==ConnectionStatus.CONNECTED)"连接没有固定使用时限，短暂掉线后会自动恢复。" else "请保持手机 App 打开，并让手机和电脑处于可互访的局域网。")
                state.errorCode?.let { code->Text(when(code){"E_NETWORK"->"电脑暂时不可达，等待网络恢复。";"E_DISCOVERY"->"暂未发现电脑，请检查局域网连接。";"E_TLS_IDENTITY","E_IDENTITY_CHANGED"->"无法确认电脑身份，请检查电脑是否重置过设备身份。";"E_STORAGE"->"无法安全保存设备信任，请检查应用存储。";"E_BUSY"->"手机已经连接到另一台电脑。";"E_NOT_TRUSTED"->"设备信任已取消，再次连接时需要允许。";else->"连接暂未完成，请检查电脑服务状态。"},color=MaterialTheme.colorScheme.error) }
                // writer/plan.html §4.2：麦克风被拒只降级音频，并把可读原因显示给用户。
                audioNote?.let { Text(it,color=MaterialTheme.colorScheme.error) }
            }
        }
        Button(onClick=onDisconnect,enabled=state.status in setOf(ConnectionStatus.CONNECTED,ConnectionStatus.RECONNECTING,ConnectionStatus.CONNECTING,ConnectionStatus.AWAITING_APPROVAL),modifier=Modifier.fillMaxWidth()){Text("断开连接")}
        OutlinedButton(onClick=onForget,enabled=state.pcLabel!=null,modifier=Modifier.fillMaxWidth()){Text("取消对这台电脑的信任")}
        Text("使用时请保持 App 在前台，屏幕会保持常亮。切换应用或锁屏会暂停，返回后自动恢复；主动断开后保持停止。",style=MaterialTheme.typography.bodySmall)
        Text("已接入摄像头与麦克风：麦克风被拒时只传视频；两者都需要授予权限。",style=MaterialTheme.typography.bodySmall)
        if(audioNote!=null&&onRequestMic!=null){ OutlinedButton(onClick=onRequestMic,modifier=Modifier.fillMaxWidth()){Text("重新授权麦克风")} }
    }
    if(state.status==ConnectionStatus.AWAITING_APPROVAL&&state.approvalRequestId!=null){
        val request=state.approvalRequestId
        AlertDialog(onDismissRequest={onApprove(request,false)},title={Text("允许这台电脑连接？")},text={Column(verticalArrangement=Arrangement.spacedBy(12.dp)){Text(state.pcLabel?:"Artemis 电脑");state.pcIdentityHint?.let{Text("电脑标识：$it")};Text("允许后会记住这台电脑，下次无需重新确认。")}},confirmButton={TextButton(onClick={onApprove(request,true)}){Text("允许并记住")}},dismissButton={TextButton(onClick={onApprove(request,false)}){Text("不允许")}})
    }
}
