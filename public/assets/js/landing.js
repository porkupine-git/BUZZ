    function copyCode(btn) {
      const codeBlock = btn.closest('.code-block');
      const code = codeBlock.querySelector('code').textContent;
      navigator.clipboard.writeText(code).then(() => {
        btn.classList.add('copied');
        btn.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          Copied!
        `;
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copy
          `;
        }, 2000);
      });
    }

    // Smooth scroll for nav links
    document.querySelectorAll('a[href^="#"]').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.querySelector(a.getAttribute('href'));
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    // ─── Playground Logic ─────────────────────
    const tryAnilist = document.getElementById('try-anilist');
    const tryEpisode = document.getElementById('try-episode');
    const toggleSub = document.getElementById('toggle-sub');
    const toggleDub = document.getElementById('toggle-dub');
    const btnLoad = document.getElementById('btn-load-embed');
    const preview = document.getElementById('playground-preview');
    const placeholder = document.getElementById('playground-placeholder');
    const statusEl = document.getElementById('playground-status');
    const codeWrap = document.getElementById('generated-code-wrap');
    const codeEl = document.getElementById('generated-code');

    let selectedAudio = 'sub';

    // Audio toggle
    toggleSub.addEventListener('click', () => {
      selectedAudio = 'sub';
      toggleSub.classList.add('active');
      toggleDub.classList.remove('active');
    });

    toggleDub.addEventListener('click', () => {
      selectedAudio = 'dub';
      toggleDub.classList.add('active');
      toggleSub.classList.remove('active');
    });

    function setStatus(type, message) {
      statusEl.className = 'playground-status playground-status--' + type;
      const icons = {
        info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
        success: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
        error: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'
      };
      statusEl.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${icons[type]}</svg>
        ${message}
      `;
    }

    // Load embed
    btnLoad.addEventListener('click', async () => {
      const anilistId = tryAnilist.value.trim();
      const epNum = tryEpisode.value.trim();

      if (!anilistId) {
        setStatus('error', 'Please enter an AniList ID');
        tryAnilist.focus();
        return;
      }

      if (!epNum || parseInt(epNum) < 1) {
        setStatus('error', 'Please enter a valid episode number');
        tryEpisode.focus();
        return;
      }

      setStatus('info', 'Loading player...');
      
      try {
        let embedPath = `/embed/ani/${anilistId}/${epNum}/${selectedAudio}`;
        
        
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const baseUrl = isLocal ? 'https://ritesh0997-hamster09.hf.space' : window.location.origin;
        const fullUrl = baseUrl + embedPath;

        // Remove old iframe if any
        const oldIframe = preview.querySelector('iframe');
        if (oldIframe) oldIframe.remove();

        // Show placeholder briefly then replace with iframe
        if (placeholder) placeholder.style.display = 'none';

        const iframe = document.createElement('iframe');
        iframe.src = embedPath;
        iframe.setAttribute('allowfullscreen', '');
        iframe.setAttribute('allow', 'autoplay; picture-in-picture');
        preview.appendChild(iframe);

      // Listen for player ready via postMessage
      const readyHandler = (e) => {
        if (e.data && e.data.type === 'aniko:ready') {
          setStatus('success', 'Player loaded successfully');
          window.removeEventListener('message', readyHandler);
        }
      };
      window.addEventListener('message', readyHandler);

      // Timeout fallback
      setTimeout(() => {
        window.removeEventListener('message', readyHandler);
        if (statusEl.classList.contains('playground-status--info')) {
          setStatus('success', 'Player loaded');
        }
      }, 15000);

      // Show generated code (always show the clean production URL)
      const cleanEmbedPath = `/embed/ani/${anilistId}/${epNum}/${selectedAudio}`;
      const embedCode = `<iframe\n  src="${baseUrl}${cleanEmbedPath}"\n  width="800"\n  height="450"\n  frameborder="0"\n  allowfullscreen\n  allow="autoplay; picture-in-picture"\n></iframe>`;

      codeEl.textContent = embedCode;
      codeWrap.style.display = 'block';
      } catch (err) {
        setStatus('error', err.message);
      }
    });

    // Enter key support in inputs
    tryAnilist.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') btnLoad.click();
    });
    tryEpisode.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') btnLoad.click();
    });

    // Copy generated code
    function copyGenerated() {
      const code = codeEl.textContent;
      const btn = document.getElementById('copy-generated');
      navigator.clipboard.writeText(code).then(() => {
        btn.classList.add('copied');
        btn.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          Copied!
        `;
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copy
          `;
        }, 2000);
      });
    }
