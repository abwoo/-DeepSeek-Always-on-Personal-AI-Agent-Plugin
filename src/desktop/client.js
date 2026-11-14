import { createPanelModule } from '../client/panel.js';
import { conversationRows } from './messages.js';
window.__ModuleLoader__.load({
  id: '@abwoo/deepseek-always-on-desktop',
  factory(require) {
    const React = require('react'), h = React.createElement;
    const { Panel, en, zh, css } = createPanelModule(React);
    const strings = {
      en: { ...en, welcome:'Your Personal Agent', welcomeDescription:'Sign in to continue with your shared agent, tasks and memory.', signIn:'Sign in', continueLogin:'Continue securely in your browser', provisioning:'Preparing your personal agent…',loginWaiting:'Waiting for sign in…', remoteOnly:'Personal Agent conversations are hosted. Your local Harness workspace stays separate.', signOut:'Sign out', title: 'Personal Agent', overview: 'Agent & tasks', conversations: 'Conversations',
        authority: 'Managed Host', unconfigured: 'Managed Host not configured', disconnected: 'Disconnected',
        connected: 'Connected', preview: 'Shared managed Personal Agent · development preview',
        newSession: 'New remote conversation', send: 'Send to agent', prompt: 'Message your agent',
        receipt: 'Input accepted by Harness. This does not confirm model completion.',
        sessionId: 'Remote Session ID', load: 'Open conversation', cancelTurn: 'Cancel current turn',
        sessionRunning: 'Agent running', idle: 'Agent idle', attention: 'Requires attention on the managed Host',
        unknown: 'Last confirmed conversation; refresh to reconcile before retrying.', you: 'You', assistant: 'Agent', received: 'Input received', context: 'Task / context',
        pushOff: 'Native notifications are not configured in this development preview.' },
      zh: { ...zh, welcome:'你的个人智能体', welcomeDescription:'登录即可继续使用同一个智能体、任务和长期记忆。', signIn:'登录',continueLogin:'在系统浏览器中继续安全登录',provisioning:'正在准备你的个人智能体…',loginWaiting:'等待完成登录…',remoteOnly:'个人智能体会话保存在托管服务中，与本机 Harness 工作区分开。',signOut:'退出登录', title: '个人智能体', overview: '智能体与任务', conversations: '会话',
        authority: '托管 Host', unconfigured: '尚未配置托管 Host', disconnected: '已断开连接', connected: '已连接',
        preview: '共享托管个人智能体 · 开发预览', newSession: '新建远程会话', send: '发送给智能体',
        prompt: '给智能体的消息', receipt: 'Harness 已接收输入，不代表模型已执行完成。',
        sessionId: '远程会话 ID', load: '打开会话', cancelTurn: '取消当前执行', sessionRunning: '智能体正在运行',
        idle: '智能体空闲', attention: '需要在托管 Host 处理授权或问题', unknown: '当前为最后确认的会话，请刷新核实后再重试。',
        you: '你', assistant: '智能体', received: '已收到的输入', context: '任务与上下文', pushOff: '此开发预览版尚未配置原生系统通知。' },
    };
    async function command(body) {
      const r = await fetch('/api/always-on-desktop/sessions', { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const result = await r.json(); if (!r.ok) throw new Error(result.error || 'Remote unavailable'); return result;
    }
    function Conversation({ t, selected, onConnection }) {
      const [id, setId] = React.useState(selected || ''), [data, setData] = React.useState(null),
        [items, setItems] = React.useState([]), [error, setError] = React.useState(''),
        [busy, setBusy] = React.useState(false), [text, setText] = React.useState('');
      const creationId = React.useRef(null), requestId = React.useRef(null), current = React.useRef(id);
      current.current = id;
      async function refresh(target = current.current) {
        try {
          if (target) { const next = await command({ action: 'read', sessionId: target }); onConnection(next.connection); if (current.current === target) setData(next); }
          else { const list = await command({ action: 'list' }); onConnection(list.connection); setItems(list.items); }
          setError('');
        } catch (e) { setError(e.message); }
      }
      React.useEffect(() => { refresh(); const timer = setInterval(() => refresh(), 5000); return () => clearInterval(timer); }, []);
      async function action(body) {
        setBusy(true); setError('');
        try {
          const result = await command(body); onConnection(result.connection); current.current = result.sessionId; setId(result.sessionId); setData(result);
          if (body.action === 'create') creationId.current = null;
          if (body.action === 'prompt') { setText(''); requestId.current = null; }
        } catch (e) { setError(e.message); } finally { setBusy(false); }
      }
      const events = (data?.events.records || []).filter((r) => r.type === 'event').map((r) => r.event);
      const messages = conversationRows(events);
      const lastTurn = events.filter((e) => e.type === 'turn/end').at(-1)?.data.reason?.kind;
      return h('section', { className: 'ao' }, h('h2', null, t('conversations')),
        h('div', { className: 'actions' },
          h('button', { disabled: busy, onClick: () => { creationId.current ||= `session-${crypto.randomUUID()}`; action({ action: 'create', creationId: creationId.current, operationId: crypto.randomUUID() }); } }, t('newSession')),
          h('button', { disabled: busy, onClick: () => refresh() }, t('refresh'))),
        h('form', { onSubmit: (e) => { e.preventDefault(); setData(null); refresh(id); } },
          h('label', null, t('sessionId'), h('input', { 'aria-label': t('sessionId'), value: id, onChange: (e) => { current.current = e.target.value; setId(e.target.value); setData(null); } })),
          h('button', { disabled: busy || !id }, t('load'))),
        !id ? items.map((item) => h('button', { key: item.sessionId, onClick: () => { current.current = item.sessionId; setId(item.sessionId); refresh(item.sessionId); } }, item.sessionId)) : null,
        error ? h('p', { role: 'alert', className: 'error' }, error, ' ', data ? t('unknown') : '') : null,
        data ? h(React.Fragment, null,
          h('p', { role: 'status' }, data.state.pendingInput.length ? t('attention') : data.state.running ? t('sessionRunning') : lastTurn === 'error' ? t('failed') : t('idle')),
          data.inputAccepted ? h('p', null, t('receipt')) : null,
          messages.map((message) => h('article', { key: message.id }, h('h3', null, t(message.role)), h('pre', null, message.text))),
          h('details', null, h('summary', null, t('runs')), h('pre', null, JSON.stringify({ sessionId: data.sessionId, state: data.state, lastTurn, cursor: data.events.cursor }, null, 2))),
          h('form', { onSubmit: (e) => { e.preventDefault(); requestId.current ||= crypto.randomUUID(); action({ action: 'prompt', sessionId: data.sessionId, requestId: requestId.current, text }); } },
            h('label', null, t('prompt'), h('textarea', { 'aria-label': t('prompt'), value: text, onChange: (e) => { setText(e.target.value); } })),
            h('button', { disabled: busy || !!error || !text.trim() }, t('send')),
            h('button', { type: 'button', disabled: busy || !!error || !data.state.running, onClick: () => action({ action: 'cancel', sessionId: data.sessionId, operationId: crypto.randomUUID() }) }, t('cancelTurn')))) : null);
    }
    function AccountWelcome({t,onSignedIn}){
      const [busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[authorize,setAuthorize]=React.useState(''),[state,setState]=React.useState('');
      React.useEffect(()=>{if(!authorize)return;let active=true;const timer=setInterval(async()=>{try{const r=await fetch('/api/always-on-desktop/login-complete',{method:'POST'});const value=await r.json();if(!r.ok)throw Error(value.error);if(active){setState(value.state);if(value.state==='ready')onSignedIn(value.connection);}}catch(e){if(active){setError(e.message);setAuthorize('');}}},1500);return()=>{active=false;clearInterval(timer);};},[authorize]);
      async function signIn(){setBusy(true);setError('');try{const r=await fetch('/api/always-on-desktop/login-start',{method:'POST'});const value=await r.json();if(!r.ok)throw Error(value.error);setAuthorize(value.authorizeUrl);window.open(value.authorizeUrl,'_blank','noopener,noreferrer');}catch(e){setError(e.message);}finally{setBusy(false);}}
      return h('section',{className:'ao'},h('h1',null,t('welcome')),h('p',null,t('welcomeDescription')),h('button',{disabled:busy||!!authorize,onClick:signIn},t('signIn')),authorize?h('p',null,h('a',{href:authorize,target:'_blank',rel:'noopener noreferrer'},t('continueLogin'))):null,state?h('p',{role:'status'},t(state==='provisioning'?'provisioning':'loginWaiting')):null,error?h('p',{role:'alert'},error):null,h('p',{className:'muted'},t('remoteOnly')));
    }
    function Pairing({onPaired}) {
      const [origin,setOrigin]=React.useState(''),[code,setCode]=React.useState(''),[name,setName]=React.useState('My Desktop'),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false);
      return h('form',{className:'ao',onSubmit:async e=>{e.preventDefault();setBusy(true);try{const r=await fetch('/api/always-on-desktop/pair',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({origin,code,name})});const data=await r.json();if(!r.ok)throw Error(data.error);setCode('');onPaired(data);}catch(e){setError(e.message);}finally{setBusy(false);}}},h('h2',null,'Pair your Personal Agent'),h('p',null,'Use your managed service address and a one-use code. This panel uses the same remote agent as your phone.'),[['HTTPS service address',origin,setOrigin],['One-use pairing code',code,setCode],['Device name',name,setName]].map(([label,value,set])=>h('label',{key:label},label,h('input',{required:true,type:label.includes('code')?'password':'text',value,onChange:e=>set(e.target.value)}))),h('button',{disabled:busy},'Pair Desktop'),error?h('p',{role:'alert'},error):null);
    }
    function ManagedTools({view,accountMode}){
      const [items,setItems]=React.useState([]),[code,setCode]=React.useState(null),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false);
      async function call(body){const r=await fetch('/api/always-on-desktop/manage',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(data.error);return data;}
      async function refresh(){try{setItems((await call({action:view==='goals'?'goals.list':'devices.list'})).items);setError('');}catch(e){setError(e.message);}}
      React.useEffect(()=>{refresh();const timer=setInterval(refresh,10000);return()=>clearInterval(timer);},[view]);
      async function act(body){setBusy(true);try{const result=await call(body);if(body.action==='devices.pair-code')setCode(result);await refresh();}catch(e){setError(e.message);}finally{setBusy(false);}}
      return h('section',{className:'ao'},h('h2',null,view==='goals'?'Ongoing goals':'Paired devices'),error?h('p',{role:'alert'},error):null,
       view==='goals'?h('form',{onSubmit:e=>{e.preventDefault();const f=new FormData(e.currentTarget);act({action:'goals.create',operationId:crypto.randomUUID(),goal:{title:f.get('title'),instruction:f.get('instruction'),everySeconds:Number(f.get('minutes'))*60,maxRuns:30,allowedTools:['web_search','web_fetch']}});}},h('label',null,'Goal name',h('input',{name:'title',required:true,maxLength:120})),h('label',null,'What should the agent watch?',h('textarea',{name:'instruction',required:true,maxLength:12000})),h('label',null,'Check every (minutes)',h('input',{name:'minutes',type:'number',min:1,max:525600,defaultValue:1440,required:true})),h('p',null,'Read-only research, up to 30 runs. Pause or cancel the linked task in Tasks.'),h('button',{disabled:busy},'Create ongoing goal')):
       h('div',null,accountMode?null:h('button',{disabled:busy,onClick:()=>act({action:'devices.pair-code'})},'Pair another device'),code?h('article',null,h('p',null,'One-use code · expires ',code.expiresAt),h('pre',null,code.code),h('button',{onClick:()=>setCode(null)},'Hide code')):null),
       items.map(item=>h('article',{key:item.id},h('h3',null,item.title||item.name),view==='goals'?h('p',null,item.instruction,' · Task ',item.taskId):h('p',null,item.platform,' · ',item.revoked?'Revoked':'Paired'),view==='devices'&&!item.revoked?h('button',{disabled:busy,onClick:()=>{if(confirm('Revoke this device?'))act({action:'devices.revoke',deviceId:item.id});}},'Revoke access'):null)));
    }
    function Desktop({ t }) {
      const [status, setStatus] = React.useState(null), [view, setView] = React.useState('overview'), [session, setSession] = React.useState(''),[pending,setPending]=React.useState([]),[controlError,setControlError]=React.useState('');
      React.useEffect(() => {
        let active = true;
        const load = () => fetch('/api/always-on-desktop/status').then((r) => r.json()).then((s) => { if (active) setStatus(s);if(active&&s.configured&&s.credentialMode==='device-pairing')fetch('/api/always-on-desktop/pending',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).then(r=>r.json()).then(p=>{if(active&&Array.isArray(p))setPending(p.filter(x=>x.status!=='committed'));}).catch(()=>{}); }).catch(() => { if (active) setStatus((s) => ({ ...s, connected: false })); });
        load(); const timer = setInterval(load, 3000); return () => { active = false; clearInterval(timer); };
      }, []);
      if(status?.credentialMode==='account'&&!status.configured)return h(React.Fragment,null,h('style',null,css),h(AccountWelcome,{t,onSignedIn:setStatus}));
      if(status?.credentialMode==='device-pairing'&&!status.configured)return h(React.Fragment,null,h('style',null,css),h(Pairing,{onPaired:setStatus}));
      async function control(action,body={}){try{const r=await fetch('/api/always-on-desktop/'+action,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(data.error);setControlError('');if(action==='forget'){setStatus(data);setPending([]);}else if(action==='dismiss')setPending(pending.filter(p=>p.operationId!==body.operationId));}catch(e){setControlError(e.message);}}
      return h('div', { style: { height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' } }, h('style', null, css),
        h('header', { className: 'ao', style: { height: 'auto', paddingBottom: 0, flexShrink: 0 } },
          status?.credentialMode==='account'?h('p',{'data-testid':'desktop-remote-authority'},t('title')):h('p', { 'data-testid': 'desktop-remote-authority' }, t('authority'), ': ', status?.authority || t('unconfigured')),
          h('p', { role: 'status' }, status?.connected ? t('connected') : t('disconnected')),
          h('p', { className: 'muted' }, t('preview')),
          ['device-pairing','account'].includes(status?.credentialMode)?h('button',{onClick:()=>{if(confirm('Revoke this Desktop device and remove its local credentials?'))control('forget');}},status?.credentialMode==='account'?t('signOut'):'Remove device access'):null,
          controlError?h('p',{role:'alert'},controlError):null,
          pending.map(p=>h('article',{key:p.operationId},h('p',null,'Review uncertain operation: ',p.action,' · ',p.status),h('button',{onClick:()=>{if(confirm('Review the managed task or Session first. Dismissing does not reverse or retry it.'))control('dismiss',{operationId:p.operationId});}},'Dismiss after review'))),
          h('nav', null, ['overview', 'conversations',...(['device-pairing','account'].includes(status?.credentialMode)?['goals','devices']:[])].map((v) => h('button', { key: v, 'aria-selected': view === v, onClick: () => setView(v) }, v==='goals'?'Goals':v==='devices'?'Devices':t(v))))),
        h('div', { style: { flex: 1, minHeight: 0, overflow: 'hidden' } },
          view === 'overview' ? h(Panel, { t, apiPath: '/api/always-on-desktop/state', operationIds: true, onSnapshot: (data) => {setStatus(data.connection);setPending(data.pendingOperations||[]);}, openSession: (id) => { setSession(id); setView('conversations'); } })
            : ['goals','devices'].includes(view)?h(ManagedTools,{key:view,view,accountMode:status?.credentialMode==='account'}):pending.length?h('p',{className:'ao'},'Review pending operations before sending another message.'):h(Conversation, { t, selected: session, onConnection: setStatus })));
    }
    return { inject: ['slots', 'locale'], apply(ctx) {
      ctx.effect(() => ctx.locale.register('abwoo.personalAgent', strings)); const t = ctx.locale.bind('abwoo.personalAgent');
      // Client packages remain installed when a bundle is disabled. Tie slots to the real Host route.
      let child=null,stopped=false,checking=false;
      const check=async()=>{if(checking||stopped)return;checking=true;try{
        const r=await fetch('/api/always-on-desktop/status');
        if(stopped)return;
        if(r.ok&&!child)child=ctx.plugin({apply(scope){
      scope.slots.inject('main', () => scope.slots.register({ name: 'main', key: 'always-on-personal-agent', locale: 'abwoo.personalAgent', inject: () => ({ t }) }, Desktop));
      scope.slots.inject('sidebar.panellist', () => scope.slots.register({ name: 'sidebar.panellist', id: 'always-on-personal-agent', order: 11, locale: 'abwoo.personalAgent', label: () => t('title') }, () => h('span', null, '∞')));
        }});
        else if(r.status===404&&child){await child.dispose();child=null;}
      }catch{}finally{checking=false;}};
      check();const timer=setInterval(check,1500);
      ctx.effect(()=>async()=>{stopped=true;clearInterval(timer);await child?.dispose();});

    } };
  },
});
