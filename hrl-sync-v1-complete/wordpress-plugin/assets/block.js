(function(blocks, element, blockEditor, components) {
  const { registerBlockType } = blocks;
  const { createElement: el, useState, useEffect } = element;
  const { InspectorControls } = blockEditor;
  const { PanelBody, TextControl, SelectControl, ToggleControl, RangeControl, Placeholder } = components;

  registerBlockType('hrl-sync/playlist', {
    title: 'HRL Sync Playlist',
    icon: el('span', null, '🎵'),
    category: 'embed',
    description: 'Embed an HRL Sync music playlist — audio streamed from Google Drive.',
    keywords: ['hrl','music','playlist','audio','hardban'],
    attributes: {
      token:    { type: 'string',  default: '' },
      theme:    { type: 'string',  default: hrlSyncConfig?.defaultTheme || 'dark' },
      autoplay: { type: 'boolean', default: false },
      height:   { type: 'number',  default: 480 },
    },
    edit({ attributes, setAttributes }) {
      const { token, theme, autoplay, height } = attributes;
      const [valid, setValid] = useState(null);

      useEffect(() => {
        if (!token || token.length < 20) { setValid(null); return; }
        fetch('/wp-json/hrl-sync/v1/status')
          .then(r => r.json())
          .then(d => setValid(d.status === 'ok'))
          .catch(() => setValid(false));
      }, [token]);

      const api = hrlSyncConfig?.apiUrl || '';
      const src = token ? `${api}/api/embed-player?token=${token}&theme=${theme}` : null;

      return el('div', null,
        el(InspectorControls, null,
          el(PanelBody, { title: 'HRL Sync Settings', initialOpen: true },
            el(TextControl, {
              label: 'Playlist Token',
              value: token,
              onChange: v => setAttributes({ token: v }),
              help: 'HRL Sync → Pitches → Share Link → copy token',
            }),
            el(SelectControl, {
              label: 'Theme',
              value: theme,
              options: [{ label: 'Dark', value: 'dark' }, { label: 'Light', value: 'light' }],
              onChange: v => setAttributes({ theme: v }),
            }),
            el(ToggleControl, {
              label: 'Autoplay',
              checked: autoplay,
              onChange: v => setAttributes({ autoplay: v }),
            }),
            el(RangeControl, {
              label: 'Height (px)',
              value: height, min: 300, max: 900, step: 20,
              onChange: v => setAttributes({ height: v }),
            })
          )
        ),
        !token
          ? el(Placeholder, {
              icon: el('span', { style: { fontSize: '24px' } }, '🎵'),
              label: 'HRL Sync Playlist',
              instructions: 'Enter a playlist token in the sidebar →',
            })
          : el('div', null,
              valid === false && el('div', {
                style: { background: 'rgba(255,60,80,.1)', border: '1px solid rgba(255,60,80,.3)', borderRadius: '4px', padding: '8px 12px', marginBottom: '8px', fontFamily: 'monospace', fontSize: '12px', color: '#FF3C50' }
              }, '⚠ Could not verify API connection. Check Settings → HRL Sync.'),
              el('iframe', {
                src,
                style: { width: '100%', height: height + 'px', border: 'none', borderRadius: '10px', display: 'block' },
                allow: 'autoplay',
              })
            )
      );
    },
    save: () => null,
  });

})(window.wp.blocks, window.wp.element, window.wp.blockEditor, window.wp.components);
