export const CSS_TARGET = ['chrome111', 'edge111', 'firefox121', 'safari16.4', 'ios16.4'];

const rootSelector = (rule) => rule.params.match(/^\((.*)\)$/)?.[1];

// Lower the skin's root-only scopes, including scopes nested inside Scaffold.
export function flattenScope(selectorParser) {
  return {
    postcssPlugin: 'window-seat-flatten-scope',
    OnceExit(css) {
      const scopes = [];
      const qualified = new WeakSet();
      css.walkAtRules('scope', (rule) => { scopes.push(rule); });

      for (const scope of scopes.reverse()) {
        let root = rootSelector(scope);
        if (!root) throw scope.error('Expected a root-only @scope rule');
        for (let parent = scope.parent; parent; parent = parent.parent) {
          if (parent.type === 'atrule' && parent.name === 'scope') {
            root = `:where(${rootSelector(parent)}) :where(${root})`;
          }
        }

        scope.walkRules((rule) => {
          if (qualified.has(rule)) return;
          for (let parent = rule.parent; parent !== scope; parent = parent.parent) {
            if (parent.type === 'rule') return;
          }
          qualified.add(rule);
          const prefix = `:where(${root})`;
          rule.selector = selectorParser((selectors) => {
            selectors.each((selector) => {
              let usesRoot = false;
              selector.walk((node) => {
                const explicitScope = node.type === 'pseudo' && node.value === ':scope';
                if (!explicitScope && node.type !== 'nesting') return;
                usesRoot = true;
                // An explicit :scope has one pseudo-class worth of specificity.
                const replacement = explicitScope ? `${prefix}:is(*, :root)` : prefix;
                node.replaceWith(...selectorParser().astSync(replacement).first.nodes);
              });
              if (usesRoot) return;
              selector.prepend(selectorParser.combinator({ value: ' ' }));
              selector.prepend(selectorParser().astSync(prefix).first.first);
            });
          }).processSync(rule.selector);
        });

        scope.replaceWith(...scope.nodes);
      }
    },
  };
}
