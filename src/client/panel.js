export function createPanelModule(React) {
  const h = React.createElement;
    const en = {
      title: 'Always-on',
      agent: 'Agent',
      tasks: 'Tasks',
      memory: 'Memory',
      inbox: 'Inbox',
      online: 'Host online',
      offline: 'Host offline · showing last confirmed data',
      loading: 'Connecting to your host…',
      retry: 'Retry',
      refresh: 'Refresh',
      create: 'Create task',
      name: 'Task name',
      instruction: 'What should your agent check?',
      interval: 'Interval (minutes)',
      daily: 'Daily',
      once: 'Once',
      every: 'Every N minutes',
      time: 'Local time',
      at: 'Date and time',
      zone: 'Time zone',
      save: 'Save with my consent',
      content: 'Information to remember',
      source: 'Source / why it is saved',
      userSource: 'User',
      kind: 'Memory type',
      consent: 'I allow this information to be used across sessions.',
      empty: 'Nothing here yet.',
      pause: 'Pause',
      resume: 'Resume',
      cancel: 'Cancel',
      run: 'Run now',
      remove: 'Delete',
      confirm: 'Confirm memory',
      edit: 'Edit',
      read: 'Mark read',
      push: 'Enable notifications',
      unpush: 'Disable notifications',
      pushHelp: 'On iPhone, add this page to your Home Screen, then enable notifications here.',
      pushReady: 'Notifications enabled',
      pushOff: 'Push is not configured on this host. Your Inbox still works.',
      unauthorized: 'Sign in to Harness, then retry.',
      runs: 'Recent runs',
      budget: 'Limit: 30 runs · 8 steps/run · 3 minutes/run · read-only web tools',
      safe: 'Tasks run while this Host is online. Chat stays in Harness.',
      view: 'Open execution session',
      pending: 'Awaiting your confirmation',
      error: 'Something went wrong',
      active: 'active',
      paused: 'paused',
      cancelled: 'cancelled',
      exhausted: 'budget exhausted',
      configuring: 'configuring',
      completed: 'completed',
      running: 'running',
      failed: 'failed',
      needs_approval: 'needs approval',
      interrupted: 'interrupted',
      unconfirmed: 'result unconfirmed',
      fact: 'Fact',
      preference: 'Preference',
      project: 'Project',
      goal: 'Goal',
      scheduled: 'Scheduled',
      next: 'Next run',
      notice: 'No changes means no notification. Results remain in the run history.',
    };
    const zh = {
      title: '持续智能体',
      agent: '智能体',
      tasks: '任务',
      memory: '记忆',
      inbox: '收件箱',
      online: 'Host 在线',
      offline: 'Host 离线 · 当前为最后确认的数据',
      loading: '正在连接 Host…',
      retry: '重试',
      refresh: '刷新',
      create: '创建任务',
      name: '任务名称',
      instruction: '希望智能体持续检查什么？',
      interval: '间隔（分钟）',
      daily: '每天',
      once: '一次',
      every: '每隔 N 分钟',
      time: '当地时间',
      at: '日期和时间',
      zone: '时区',
      save: '同意并保存',
      content: '需要记住的信息',
      source: '来源 / 保存原因',
      userSource: '用户',
      kind: '记忆类型',
      consent: '我允许跨会话使用这条信息。',
      empty: '暂无记录。',
      pause: '暂停',
      resume: '恢复',
      cancel: '取消',
      run: '立即运行',
      remove: '删除',
      confirm: '确认保存',
      edit: '编辑',
      read: '标为已读',
      push: '开启通知',
      unpush: '关闭通知',
      pushHelp: 'iPhone 请先将页面添加到主屏幕，再在此授权通知。',
      pushReady: '已开启通知',
      pushOff: 'Host 尚未配置推送；收件箱仍可使用。',
      unauthorized: '请先登录 Harness，再重试。',
      runs: '最近执行',
      budget: '上限：30 次 · 每次 8 步 · 每次 3 分钟 · 仅网页只读工具',
      safe: '任务在此 Host 在线时运行。聊天继续使用 Harness。',
      view: '打开执行会话',
      pending: '等待你确认',
      error: '操作失败',
      active: '运行中',
      paused: '已暂停',
      cancelled: '已取消',
      exhausted: '预算已用尽',
      configuring: '配置中',
      completed: '已完成',
      running: '执行中',
      failed: '失败',
      needs_approval: '需要批准',
      interrupted: '已中断',
      unconfirmed: '结果未确认',
      fact: '事实',
      preference: '偏好',
      project: '项目',
      goal: '目标',
      scheduled: '已安排',
      next: '下次执行',
      notice: '没有新进展时不推送；结果仍保存在执行记录中。',
    };
    const css = `.ao{height:100%;overflow:auto;color:var(--dsh-text-primary,inherit);padding:28px clamp(16px,4vw,52px);padding-top:max(28px,var(--dsh-frame-leading-clearance,28px));font:inherit;box-sizing:border-box}.ao *{box-sizing:border-box}.ao header{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}.ao h1{font-size:26px;margin:0}.ao .muted{opacity:.66;font-size:13px;line-height:1.6}.ao nav{display:flex;gap:8px;flex-wrap:wrap;margin:22px 0}.ao button{min-height:44px;border:1px solid #8293a547;border-radius:9px;padding:9px 15px;background:transparent;color:inherit;cursor:pointer;font:inherit}.ao button[aria-selected=true],.ao .primary{background:#25887922;border-color:#50ae9a}.ao button:disabled{opacity:.45;cursor:wait}.ao .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:16px}.ao article,.ao form,.ao .stats{border:1px solid #8293a533;border-radius:14px;padding:20px;margin-bottom:14px}.ao label{display:grid;gap:7px;margin-bottom:14px;font-size:14px}.ao input,.ao textarea,.ao select{min-height:44px;width:100%;padding:10px;border:1px solid #8293a555;border-radius:8px;color:inherit;background:transparent;font:inherit}.ao select option{color:#14253c;background:white}.ao textarea{min-height:96px;resize:vertical}.ao .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.ao .badge{display:inline-block;padding:4px 9px;border-radius:20px;background:#66b9a51a;font-size:12px}.ao .error{border:1px solid #d47d6c;padding:12px;border-radius:8px;margin:12px 0;overflow-wrap:anywhere}.ao .check{display:flex;align-items:center;gap:10px}.ao .check input{width:20px;min-height:20px}.ao pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}.ao a{color:#409e8c}.ao h3{margin:0 0 12px;overflow-wrap:anywhere}.ao .stats{font-size:28px}.ao .stats span{display:block;font-size:13px;opacity:.7;margin-top:6px}@media(max-width:600px){.ao{padding:20px 16px;padding-top:48px}.ao nav button{flex:1}.ao form,.ao article{padding:16px}}`;
    function Panel({ t, openSession, apiPath = '/api/always-on', onSnapshot }) {
      const [data, setData] = React.useState(null),
        [connected, setConnected] = React.useState(true),
        [tab, setTab] = React.useState(
          new URLSearchParams(location.search).has('alwaysOnInbox') ? 'inbox' : 'agent',
        ),
        [error, setError] = React.useState(''),
        [busy, setBusy] = React.useState(false),
        [editing, setEditing] = React.useState(null),
        [pushState, setPush] = React.useState(''),
        [timingMode, setTimingMode] = React.useState('every');
      async function refresh() {
        try {
          const r = await fetch(apiPath, {
            credentials: 'same-origin',
            cache: 'no-store',
          });
          if (!r.ok)
            throw new Error(
              r.status === 401 || r.status === 403 ? t('unauthorized') : r.statusText,
            );
          const next = await r.json();
          setData(next);
          setConnected(true);
          onSnapshot?.(next);
          setError('');
        } catch (e) {
          setConnected(false);
          setError(e.message);
        }
      }
      React.useEffect(() => {
        let alive = true;
        async function load() {
          if (alive) await refresh();
        }
        load();
        const id = setInterval(load, 10000);
        return () => {
          alive = false;
          clearInterval(id);
        };
      }, []);
      async function action(name, value) {
        if (!connected) { setError(t('offline')); return false; }
        setBusy(true);
        setError('');
        try {
          const r = await fetch(apiPath, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: name, data: value }),
          });
          const result = await r.json();
          if (!r.ok || !result.ok) throw new Error(result.error ?? t('error'));
          await refresh();
          return true;
        } catch (e) {
          setError(e.message);
          return false;
        } finally {
          setBusy(false);
        }
      }
      const button = (label, fn, props = {}) =>
        h('button', { type: 'button', onClick: fn, disabled: busy || !connected, ...props }, label);
      const field = (label, name, props = {}) =>
        h('label', null, t(label), h('input', { name, required: true, ...props }));
      function taskForm() {
        return h(
          'form',
          {
            onSubmit: async (e) => {
              e.preventDefault();
              const f = e.currentTarget,
                v = new FormData(f),
                kind = v.get('timing');
              let timing;
              if (kind === 'every') timing = { kind, every_seconds: Number(v.get('minutes')) * 60 };
              else if (kind === 'daily')
                timing = {
                  kind,
                  daily: { time: String(v.get('time')), time_zone: String(v.get('zone')) },
                };
              else timing = { kind: 'at', at: new Date(String(v.get('at'))).toISOString() };
              if (
                await action('task.create', {
                  title: v.get('title'),
                  instruction: v.get('instruction'),
                  timing,
                  allowedTools: ['web_search', 'web_fetch'],
                })
              )
                f.reset();
            },
          },
          h('h3', null, t('create')),
          field('name', 'title', { maxLength: 120 }),
          h(
            'label',
            null,
            t('instruction'),
            h('textarea', { name: 'instruction', required: true, maxLength: 12000 }),
          ),
          h(
            'label',
            null,
            t('scheduled'),
            h(
              'select',
              { name: 'timing', value: timingMode, onChange: (e) => setTimingMode(e.target.value) },
              ['every', 'daily', 'once'].map((v) => h('option', { key: v, value: v }, t(v))),
            ),
          ),
          h(
            'div',
            { className: 'grid' },
            timingMode === 'every'
              ? field('interval', 'minutes', {
                  type: 'number',
                  min: 1,
                  max: 525600,
                  defaultValue: 60,
                })
              : null,
            timingMode === 'daily'
              ? h(
                  React.Fragment,
                  null,
                  field('time', 'time', { type: 'time', defaultValue: '09:00' }),
                  field('zone', 'zone', {
                    defaultValue: Intl.DateTimeFormat().resolvedOptions().timeZone,
                  }),
                )
              : null,
            timingMode === 'once' ? field('at', 'at', { type: 'datetime-local' }) : null,
          ),
          h('p', { className: 'muted' }, t('budget')),
          h('button', { type: 'submit', className: 'primary', disabled: busy }, t('create')),
        );
      }
      function memoryForm() {
        return h(
          'form',
          {
            key: editing?.id ?? 'new',
            onSubmit: async (e) => {
              e.preventDefault();
              const f = e.currentTarget,
                v = new FormData(f);
              if (
                await action('memory.save', {
                  ...(editing ? { id: editing.id } : {}),
                  kind: v.get('kind'),
                  content: v.get('content'),
                  source: v.get('source'),
                  consent: true,
                })
              ) {
                setEditing(null);
                f.reset();
              }
            },
          },
          h(
            'label',
            null,
            t('kind'),
            h(
              'select',
              { name: 'kind', defaultValue: editing?.kind ?? 'fact' },
              ['fact', 'preference', 'project', 'goal'].map((v) =>
                h('option', { key: v, value: v }, t(v)),
              ),
            ),
          ),
          h(
            'label',
            null,
            t('content'),
            h('textarea', {
              name: 'content',
              required: true,
              defaultValue: editing?.content ?? '',
              maxLength: 4000,
            }),
          ),
          field('source', 'source', { defaultValue: editing?.source ?? t('userSource') }),
          h(
            'label',
            { className: 'check' },
            h('input', { type: 'checkbox', required: true }),
            t('consent'),
          ),
          h('button', { type: 'submit', className: 'primary', disabled: busy }, t('save')),
        );
      }
      async function enablePush() {
        try {
          if (!('serviceWorker' in navigator) || !('PushManager' in window))
            throw new Error(t('pushHelp'));
          const permission = await Notification.requestPermission();
          if (permission !== 'granted') throw new Error(t('pushHelp'));
          const reg = await navigator.serviceWorker.register('/api/always-on-sw.js', {
            scope: '/',
          });
          await navigator.serviceWorker.ready;
          const key = data.pushPublicKey;
          const binary = atob(key.replace(/-/g, '+').replace(/_/g, '/'));
          const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: Uint8Array.from(binary, (c) => c.charCodeAt(0)),
          });
          if (await action('push.subscribe', sub.toJSON())) setPush(t('pushReady'));
        } catch (e) {
          setError(e.message);
        }
      }
      async function disablePush() {
        try {
          const reg = await navigator.serviceWorker.getRegistration('/');
          const sub = await reg?.pushManager.getSubscription();
          if (sub) {
            const digest = await crypto.subtle.digest(
              'SHA-256',
              new TextEncoder().encode(sub.endpoint),
            );
            const id = [...new Uint8Array(digest)]
              .map((b) => b.toString(16).padStart(2, '0'))
              .join('');
            if (!(await action('push.unsubscribe', { id }))) return;
            await sub.unsubscribe();
          }
          setPush('');
        } catch (e) {
          setError(e.message);
        }
      }
      function runCard(r) {
        return h(
          'article',
          { key: r.id },
          h('h3', null, data.tasks.find((x) => x.id === r.taskId)?.title ?? r.taskId),
          h('span', { className: 'badge' }, t(r.status)),
          h('p', { className: 'muted' }, new Date(r.startedAt).toLocaleString()),
          r.result ? h('pre', null, r.result.summary) : h('p', null, r.error ?? '…'),
          r.result?.sources?.map((u) =>
            h(
              'p',
              { key: u },
              h('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, u),
            ),
          ),
          button(t('view'), () => openSession(r.sessionId)),
        );
      }
      let body = data ? null : h('p', null, t('loading'));
      if (data && tab === 'agent')
        body = h(
          React.Fragment,
          null,
          h('p', { className: 'muted' }, t('safe')),
          h(
            'div',
            { className: 'grid' },
            h(
              'div',
              { className: 'stats' },
              data.tasks.filter((x) => x.state === 'active').length,
              h('span', null, t('tasks')),
            ),
            h(
              'div',
              { className: 'stats' },
              data.runs.filter((x) => x.status === 'running').length,
              h('span', null, t('running')),
            ),
            h(
              'div',
              { className: 'stats' },
              data.inbox.filter((x) => !x.read).length,
              h('span', null, t('inbox')),
            ),
          ),
          button(t('create'), () => setTab('tasks'), { className: 'primary' }),
          h('h2', null, t('runs')),
          data.runs.slice(0, 5).map(runCard),
        );
      if (data && tab === 'tasks')
        body = h(
          React.Fragment,
          null,
          taskForm(),
          data.tasks.length
            ? data.tasks.map((x) =>
                h(
                  'article',
                  { key: x.id },
                  h('h3', null, x.title),
                  h('span', { className: 'badge' }, t(x.state)),
                  h('p', null, x.instruction),
                  x.nextScheduledAt
                    ? h(
                        'p',
                        { className: 'muted' },
                        t('next') + ': ' + new Date(x.nextScheduledAt).toLocaleString(),
                      )
                    : null,
                  h(
                    'div',
                    { className: 'actions' },
                    button(t('run'), () => action('task.run', { id: x.id }), {
                      disabled: busy || x.state !== 'active',
                    }),
                    button(
                      t(x.state === 'active' ? 'pause' : 'resume'),
                      () =>
                        action('task.control', {
                          id: x.id,
                          state: x.state === 'active' ? 'paused' : 'active',
                        }),
                      { disabled: busy || ['cancelled', 'error', 'exhausted'].includes(x.state) },
                    ),
                    button(
                      t('cancel'),
                      () => action('task.control', { id: x.id, state: 'cancelled' }),
                      { disabled: busy || x.state === 'cancelled' },
                    ),
                  ),
                ),
              )
            : h('p', null, t('empty')),
          h('h2', null, t('runs')),
          data.runs.map(runCard),
        );
      if (data && tab === 'memory')
        body = h(
          React.Fragment,
          null,
          memoryForm(),
          data.memories.map((m) =>
            h(
              'article',
              { key: m.id },
              h('span', { className: 'badge' }, t(m.kind)),
              !m.consent ? h('p', null, t('pending')) : null,
              h('pre', null, m.content),
              h('p', { className: 'muted' }, m.source),
              h(
                'div',
                { className: 'actions' },
                !m.consent
                  ? button(t('confirm'), () =>
                      action('memory.save', {
                        id: m.id,
                        kind: m.kind,
                        content: m.content,
                        source: m.source,
                        consent: true,
                      }),
                    )
                  : null,
                button(t('edit'), () => setEditing(m)),
                button(t('remove'), () => action('memory.delete', { id: m.id })),
              ),
            ),
          ),
        );
      if (data && tab === 'inbox')
        body = h(
          React.Fragment,
          null,
          h('p', { className: 'muted' }, t('notice')),
          h('p', { className: 'muted' }, data.pushPublicKey ? t('pushHelp') : t('pushOff')),
          data.pushPublicKey
            ? h(
                'div',
                { className: 'actions' },
                button(t('push'), enablePush),
                button(t('unpush'), disablePush),
              )
            : null,
          h('p', { role: 'status' }, pushState),
          data.inbox.length
            ? data.inbox.map((n) =>
                h(
                  'article',
                  { key: n.id },
                  h('h3', null, n.title),
                  h('pre', null, n.summary),
                  h('p', { className: 'muted' }, new Date(n.createdAt).toLocaleString()),
                  !n.read ? button(t('read'), () => action('inbox.read', { id: n.id })) : null,
                ),
              )
            : h('p', null, t('empty')),
        );
      return h(
        'section',
        { className: 'ao' },
        h('style', null, css),
        h(
          'header',
          null,
          h(
            'div',
            null,
            h('h1', null, t('title')),
            h('p', { className: 'muted' }, data ? t(connected ? 'online' : 'offline') : t('loading')),
          ),
          button(t('refresh'), refresh, { disabled: busy }),
        ),
        h(
          'nav',
          { 'aria-label': t('title') },
          ['agent', 'tasks', 'memory', 'inbox'].map((v) =>
            button(t(v), () => setTab(v), { key: v, 'aria-selected': tab === v, disabled: busy }),
          ),
        ),
        error
          ? h('div', { role: 'alert', className: 'error' }, error, ' ', button(t('retry'), refresh, { disabled: busy }))
          : null,
        body,
      );
    }
  return { Panel, en, zh, css };
}
