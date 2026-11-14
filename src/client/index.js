import { createPanelModule } from './panel.js';
window.__ModuleLoader__.load({
  id: '@abwoo/deepseek-always-on',
  factory(require) {
    const React = require('react'),
      h = React.createElement;
    const { Panel, en, zh } = createPanelModule(React);
    return {
      inject: ['slots', 'locale', 'uiWorkspace', 'layout'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('abwoo.alwaysOn', { en, zh }));
        const t = ctx.locale.bind('abwoo.alwaysOn');
        ctx.slots.inject('main', () =>
          ctx.slots.register(
            {
              name: 'main',
              key: 'always-on',
              locale: 'abwoo.alwaysOn',
              inject: () => ({
                t,
                openSession: async (id) => {
                  ctx.uiWorkspace.openSession(id);
                },
              }),
            },
            Panel,
          ),
        );
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: 'always-on',
              order: 12,
              locale: 'abwoo.alwaysOn',
              label: () => t('title'),
            },
            () => h('span', { 'aria-hidden': true }, '∞'),
          ),
        );
        if (new URLSearchParams(location.search).has('alwaysOnInbox'))
          ctx.inject(['layout'], (scope) => {
            scope.layout.selectPanel('always-on');
          });
      },
    };
  },
});
