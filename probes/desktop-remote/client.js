window.__ModuleLoader__.load({
  id: '@abwoo/always-on-desktop-remote-probe',
  factory(require) {
    const React = require('react'), h = React.createElement;
    function Probe() {
      const [state, setState] = React.useState(null), [id, setId] = React.useState(''),
        [error, setError] = React.useState(''), [busy, setBusy] = React.useState(false);
      async function call(action, extra = {}) {
        setError(''); setBusy(true);
        try {
          const response = await fetch('/api/always-on-phase0-remote', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action, ...(action === 'create' ? {} : { sessionId: id }), ...extra }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Remote connection failed');
          setState(data); setId(data.sessionId);
        } catch (e) { setError(e.message); } finally { setBusy(false); }
      }
      const button = (name, action) => h('button', { type: 'button', disabled: busy, onClick: action,
        style: { padding: 12, margin: 4 } }, name);
      return h('section', { style: { padding: 24, maxWidth: 1000 } },
        h('h1', null, 'Remote Session — Phase 0'),
        h('p', null, 'Development proof only. One remote authority; no local Session copy or fallback. A prompt receipt is not model completion.'),
        button('Create remote Session', () => call('create')),
        h('label', null, 'Remote Session ID', h('input', { 'aria-label': 'Remote Session ID', value: id,
          onChange: (e) => setId(e.target.value), style: { width: '100%', padding: 10 } })),
        button('Read remote Session', () => call('read')),
        button('Rename remote Session', () => call('rename', { title: 'Remote Desktop authority proof' })),
        button('Submit remote prompt', () => call('prompt', { requestId: crypto.randomUUID(), text: 'Phase 0 native remote input proof. No model success is claimed.' })),
        error ? h('p', { role: 'alert' }, error) : null,
        state ? h(React.Fragment, null,
          h('p', { 'data-testid': 'remote-authority' }, state.authority),
          h('pre', { 'data-testid': 'remote-events', style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, JSON.stringify(state, null, 2))) : null);
    }
    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'always-on-remote-probe' }, Probe));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist',
          id: 'always-on-remote-probe', order: 13, label: () => 'Remote Session probe' }, () => h('span', null, '↗')));
      },
    };
  },
});
