import { createPanelModule } from '../client/panel.js';
import { conversationRows } from './messages.js';
window.__ModuleLoader__.load({
  id: '@abwoo/deepseek-always-on-desktop',
  factory(require) {
    const React = require('react'), h = React.createElement;
    const { Panel, en, zh, css } = createPanelModule(React);
    const strings = {
      en: { ...en, title: 'Personal Agent', overview: 'Agent & tasks', conversations: 'Conversations',
        authority: 'Managed Host', unconfigured: 'Managed Host not configured', disconnected: 'Disconnected',
        connected: 'Connected', preview: 'Operator preview · device pairing is not released',
        newSession: 'New remote conversation', send: 'Send to agent', prompt: 'Message your agent',
        receipt: 'Input accepted by Harness. This does not confirm model completion.',
        sessionId: 'Remote Session ID', load: 'Open conversation', cancelTurn: 'Cancel current turn',
        sessionRunning: 'Agent running', idle: 'Agent idle', attention: 'Requires attention on the managed Host',
        unknown: 'Last confirmed conversation; refresh to reconcile before retrying.', you: 'You', assistant: 'Agent', received: 'Input received', context: 'Task / context',
        pushOff: 'Native notifications are not configured in this development preview.' },
      zh: { ...zh, title: '个人智能体', overview: '智能体与任务', conversations: '会话',
        authority: '托管 Host', unconfigured: '尚未配置托管 Host', disconnected: '已断开连接', connected: '已连接',
        preview: '管理员预览 · 设备配对尚未发布', newSession: '新建远程会话', send: '发送给智能体',
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
          h('button', { disabled: busy, onClick: () => { creationId.current ||= `session-${crypto.randomUUID()}`; action({ action: 'create', creationId: creationId.current }); } }, t('newSession')),
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
            h('button', { type: 'button', disabled: busy || !!error || !data.state.running, onClick: () => action({ action: 'cancel', sessionId: data.sessionId }) }, t('cancelTurn')))) : null);
    }
    function Desktop({ t }) {
      const [status, setStatus] = React.useState(null), [view, setView] = React.useState('overview'), [session, setSession] = React.useState('');
      React.useEffect(() => {
        let active = true;
        const load = () => fetch('/api/always-on-desktop/status').then((r) => r.json()).then((s) => { if (active) setStatus(s); }).catch(() => { if (active) setStatus((s) => ({ ...s, connected: false })); });
        load(); const timer = setInterval(load, 3000); return () => { active = false; clearInterval(timer); };
      }, []);
      return h('div', { style: { height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' } }, h('style', null, css),
        h('header', { className: 'ao', style: { height: 'auto', paddingBottom: 0, flexShrink: 0 } },
          h('p', { 'data-testid': 'desktop-remote-authority' }, t('authority'), ': ', status?.authority || t('unconfigured')),
          h('p', { role: 'status' }, status?.connected ? t('connected') : t('disconnected')),
          h('p', { className: 'muted' }, t('preview')),
          h('nav', null, ['overview', 'conversations'].map((v) => h('button', { key: v, 'aria-selected': view === v, onClick: () => setView(v) }, t(v))))),
        h('div', { style: { flex: 1, minHeight: 0, overflow: 'hidden' } },
          view === 'overview' ? h(Panel, { t, apiPath: '/api/always-on-desktop/state', onSnapshot: (data) => setStatus(data.connection), openSession: (id) => { setSession(id); setView('conversations'); } })
            : h(Conversation, { t, selected: session, onConnection: setStatus })));
    }
    return { inject: ['slots', 'locale'], apply(ctx) {
      ctx.effect(() => ctx.locale.register('abwoo.personalAgent', strings)); const t = ctx.locale.bind('abwoo.personalAgent');
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'always-on-personal-agent', locale: 'abwoo.personalAgent', inject: () => ({ t }) }, Desktop));
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'always-on-personal-agent', order: 11, locale: 'abwoo.personalAgent', label: () => t('title') }, () => h('span', null, '∞')));
    } };
  },
});
