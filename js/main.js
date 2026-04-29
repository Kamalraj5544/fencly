/* fencly · main.js
   Form submissions go to FENCLY_FORM_ENDPOINT (Google Apps Script Web App).
   See apps-script/README.md for setup. If left empty, falls back to mailto. */
const FENCLY_FORM_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzC5IeaBTBlfUALBtmE8irIjilLHYKC33Rv-AgiM6zP7uAZfH0rk3tlCTrWXRi5wed-/exec';
const FENCLY_FALLBACK_EMAIL = 'hello@fencly.com.au';

(() => {
  'use strict';

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------- Scroll orchestrator: nav, progress, parallax, velocity ---------- */
  const nav = document.getElementById('nav');
  const progressBar = document.querySelector('.scroll-progress__bar');
  const parallaxEls = document.querySelectorAll('[data-parallax]');

  let ticking = false;

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      const docH = document.documentElement.scrollHeight - window.innerHeight;

      // Nav
      nav.classList.toggle('is-scrolled', y > 40);

      // Progress
      if (progressBar && docH > 0) {
        const pct = Math.min(100, (y / docH) * 100);
        progressBar.style.width = pct + '%';
      }

      // Parallax
      if (!reduce) {
        parallaxEls.forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.bottom < 0 || rect.top > window.innerHeight) return;
          const speed = parseFloat(el.dataset.speed || '0.3');
          const offset = (rect.top + rect.height / 2 - window.innerHeight / 2) * -speed;
          el.style.setProperty('--py', Math.round(offset) + 'px');
        });
      }

      ticking = false;
    });
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  /* ---------- Cursor glow (desktop only) ---------- */
  const glow = document.querySelector('.cursor-glow');
  if (fine && glow && !reduce) {
    let tx = 0, ty = 0, cx = 0, cy = 0;
    let active = false;

    window.addEventListener('mousemove', (e) => {
      tx = e.clientX; ty = e.clientY;
      if (!active) {
        active = true;
        document.body.classList.add('cursor-active');
      }
    }, { passive: true });

    window.addEventListener('mouseleave', () => {
      active = false;
      document.body.classList.remove('cursor-active');
    });

    const loop = () => {
      cx += (tx - cx) * 0.12;
      cy += (ty - cy) * 0.12;
      glow.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
      requestAnimationFrame(loop);
    };
    loop();
  }

  /* ---------- Split-text for display headings ---------- */
  const splits = document.querySelectorAll('[data-split]');
  splits.forEach(el => {
    // Walk children, wrap text nodes word-by-word; keep element nodes (e.g. <span class="accent">)
    const wrap = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        const parts = node.textContent.split(/(\s+)/);
        parts.forEach(p => {
          if (!p) return;
          if (/^\s+$/.test(p)) {
            frag.appendChild(document.createTextNode(p));
          } else {
            const w = document.createElement('span');
            w.className = 'word';
            const inner = document.createElement('span');
            inner.textContent = p;
            w.appendChild(inner);
            frag.appendChild(w);
          }
        });
        node.parentNode.replaceChild(frag, node);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        // Wrap the whole element as one word so nested styling (e.g. .accent) is preserved
        const w = document.createElement('span');
        w.className = 'word';
        node.parentNode.insertBefore(w, node);
        w.appendChild(node);
      }
    };

    // Clone child list because wrap() mutates parent
    Array.from(el.childNodes).forEach(wrap);

    // Stagger index
    el.querySelectorAll('.word > span').forEach((s, i) => s.style.setProperty('--i', i));
  });

  /* ---------- Reveal on scroll ---------- */
  const reveals = document.querySelectorAll('[data-reveal], [data-split]');
  if ('IntersectionObserver' in window && reveals.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.01, rootMargin: '0px 0px -10% 0px' });
    reveals.forEach(el => io.observe(el));
  } else {
    reveals.forEach(el => el.classList.add('is-in'));
  }

  /* ---------- Number counters ---------- */
  const counters = document.querySelectorAll('[data-count]');
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const runCounter = (el) => {
    const target = parseFloat(el.dataset.count);
    const duration = parseInt(el.dataset.duration || '1500', 10);
    if (reduce) { el.textContent = target; return; }
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const v = Math.round(target * easeOut(p));
      el.textContent = v;
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = target;
    };
    requestAnimationFrame(tick);
  };
  if ('IntersectionObserver' in window) {
    const cio = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          runCounter(entry.target);
          cio.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });
    counters.forEach(el => cio.observe(el));
  } else {
    counters.forEach(el => el.textContent = el.dataset.count);
  }

  /* ---------- Hero card tilt (3D mouse-follow) ---------- */
  if (fine && !reduce) {
    const tilt = document.querySelector('[data-tilt]');
    const wrap = tilt?.parentElement;
    if (tilt && wrap) {
      let rx = 0, ry = 0, cx = 0, cy = 0;
      let rafId = null;
      const loop = () => {
        cx += (rx - cx) * 0.12;
        cy += (ry - cy) * 0.12;
        tilt.style.transform = `rotate(-2.5deg) perspective(1000px) rotateX(${cy}deg) rotateY(${cx}deg)`;
        if (Math.abs(cx - rx) > 0.05 || Math.abs(cy - ry) > 0.05) rafId = requestAnimationFrame(loop);
        else rafId = null;
      };
      wrap.addEventListener('mousemove', (e) => {
        const r = tilt.getBoundingClientRect();
        const mx = (e.clientX - r.left) / r.width - 0.5;
        const my = (e.clientY - r.top) / r.height - 0.5;
        rx = mx * 10;
        ry = -my * 10;
        if (!rafId) rafId = requestAnimationFrame(loop);
      });
      wrap.addEventListener('mouseleave', () => {
        rx = 0; ry = 0;
        if (!rafId) rafId = requestAnimationFrame(loop);
      });
    }
  }

  /* ---------- Magnetic buttons (subtle) ---------- */
  if (fine && !reduce) {
    document.querySelectorAll('.btn').forEach(btn => {
      btn.addEventListener('mousemove', (e) => {
        const r = btn.getBoundingClientRect();
        const mx = e.clientX - r.left - r.width / 2;
        const my = e.clientY - r.top - r.height / 2;
        btn.style.transform = `translate(${mx * 0.12}px, ${my * 0.18}px)`;
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.transform = '';
      });
    });
  }

  /* ---------- Nav pill: sliding indicator + active section ---------- */
  const navPill = document.querySelector('.nav__pill');
  const navIndicator = document.querySelector('.nav__indicator');
  const navLinks = Array.from(document.querySelectorAll('.nav__pill a[data-section]'));

  const placeIndicator = (link, animate = true) => {
    if (!navIndicator || !link) return;
    const r = link.getBoundingClientRect();
    const p = link.parentElement.getBoundingClientRect();
    if (!animate) navIndicator.style.transition = 'none';
    navIndicator.style.width = r.width + 'px';
    navIndicator.style.transform = `translateX(${r.left - p.left - 4}px)`;
    if (!animate) {
      // Force reflow then restore transition
      navIndicator.offsetHeight;
      navIndicator.style.transition = '';
    }
  };

  let activeLink = null;
  const setActiveSection = (id) => {
    navLinks.forEach(a => {
      const on = a.dataset.section === id;
      a.classList.toggle('is-active', on);
      if (on) activeLink = a;
    });
    if (activeLink) {
      placeIndicator(activeLink);
      navIndicator.classList.add('is-active');
    } else if (navIndicator) {
      navIndicator.classList.remove('is-active');
    }
  };

  if (navPill) {
    navLinks.forEach(link => {
      link.addEventListener('mouseenter', () => placeIndicator(link));
      link.addEventListener('focus', () => placeIndicator(link));
    });
    navPill.addEventListener('mouseleave', () => {
      if (activeLink) placeIndicator(activeLink);
      else navIndicator?.classList.remove('is-active');
    });
    window.addEventListener('resize', () => {
      if (activeLink) placeIndicator(activeLink, false);
    });

    // Track active section on scroll — pick whichever section contains the
    // trigger line (30% from the top of the viewport). This is robust against
    // sections of wildly different heights, which intersection ratios are not.
    const sectionIds = navLinks.map(a => a.dataset.section).filter(Boolean);
    const sections = sectionIds
      .map(id => document.getElementById(id))
      .filter(Boolean);

    if (sections.length) {
      let spyTicking = false;
      const updateActiveSection = () => {
        const triggerY = window.innerHeight * 0.3;
        let current = null;
        for (const s of sections) {
          const r = s.getBoundingClientRect();
          if (r.top <= triggerY && r.bottom > triggerY) { current = s; break; }
        }
        setActiveSection(current ? current.id : null);
      };
      const onSpyScroll = () => {
        if (spyTicking) return;
        spyTicking = true;
        requestAnimationFrame(() => {
          updateActiveSection();
          spyTicking = false;
        });
      };
      window.addEventListener('scroll', onSpyScroll, { passive: true });
      window.addEventListener('resize', onSpyScroll);
      updateActiveSection();
    }
  }

  /* ---------- Mobile menu ---------- */
  const toggle = document.querySelector('.nav__toggle');
  const mobile = document.getElementById('mobileMenu');
  if (toggle && mobile) {
    const close = () => {
      toggle.setAttribute('aria-expanded', 'false');
      mobile.hidden = true;
      document.body.style.overflow = '';
    };
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      mobile.hidden = open;
      document.body.style.overflow = open ? '' : 'hidden';
    });
    mobile.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
  }

  /* ---------- Palette interactive feature ---------- */
  const paletteChip = document.getElementById('paletteChip');
  const paletteName = document.getElementById('paletteName');
  const paletteHex = document.getElementById('paletteHex');
  const paletteTone = document.getElementById('paletteTone');
  const paletteAvail = document.getElementById('paletteAvail');
  const paletteSwatches = document.querySelectorAll('.palette__sw');

  const updatePalette = (sw) => {
    if (!sw || !paletteChip) return;
    paletteSwatches.forEach(s => s.classList.remove('is-active'));
    sw.classList.add('is-active');

    const c1 = sw.dataset.c1 || '#8B6914';
    const c2 = sw.dataset.c2 || '';
    paletteChip.style.setProperty('--c1', c1);
    if (c2) {
      paletteChip.style.setProperty('--c2', c2);
      paletteChip.classList.add('palette__feature-chip--dual');
    } else {
      paletteChip.classList.remove('palette__feature-chip--dual');
    }
    if (paletteName) paletteName.textContent = sw.dataset.name || '';
    if (paletteHex) paletteHex.textContent = sw.dataset.hex || '';
    if (paletteTone) paletteTone.textContent = sw.dataset.tone || '';
    if (paletteAvail) paletteAvail.textContent = sw.dataset.avail || '';
  };
  paletteSwatches.forEach(sw => {
    sw.addEventListener('mouseenter', () => updatePalette(sw));
    sw.addEventListener('focus', () => updatePalette(sw));
    sw.addEventListener('click', () => updatePalette(sw));
  });

  /* ---------- Perf metric bars (trigger on scroll into view) ---------- */
  if ('IntersectionObserver' in window) {
    const metrics = document.querySelectorAll('.perf-metric');
    const mio = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          mio.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });
    metrics.forEach(m => mio.observe(m));
  }

  /* ---------- Product showcase ---------- */
  const pcards = Array.from(document.querySelectorAll('.pcard'));
  const panels = Array.from(document.querySelectorAll('.panel'));
  const pdeckCurrent = document.getElementById('pdeckCurrent');
  const pdeckName = document.getElementById('pdeckName');
  const pdeckBar = document.getElementById('pdeckBar');
  const pnavBtns = document.querySelectorAll('.pnav');

  const setActive = (idx, opts = {}) => {
    if (idx < 0) idx = pcards.length - 1;
    if (idx >= pcards.length) idx = 0;
    const card = pcards[idx];
    if (!card) return;
    const target = card.dataset.tab;

    pcards.forEach(c => {
      c.classList.remove('is-active');
      c.setAttribute('aria-selected', 'false');
    });
    card.classList.add('is-active');
    card.setAttribute('aria-selected', 'true');

    panels.forEach(p => {
      const active = p.id === target;
      p.classList.toggle('is-active', active);
      p.hidden = !active;
    });

    // Update deck
    const num = String(idx + 1).padStart(2, '0');
    if (pdeckCurrent) pdeckCurrent.textContent = num;
    if (pdeckName) pdeckName.textContent = card.dataset.name || card.querySelector('.pcard__name')?.textContent || '';
    if (pdeckBar) pdeckBar.style.width = ((idx + 1) / pcards.length * 100).toFixed(2) + '%';

    if (opts.scrollCard !== false) {
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  };

  pcards.forEach((card, idx) => {
    card.addEventListener('click', () => setActive(idx));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const next = (idx + 1) % pcards.length;
        pcards[next].focus();
        setActive(next);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = (idx - 1 + pcards.length) % pcards.length;
        pcards[prev].focus();
        setActive(prev);
      }
    });
  });

  pnavBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const activeIdx = pcards.findIndex(c => c.classList.contains('is-active'));
      const dir = btn.dataset.nav === 'next' ? 1 : -1;
      setActive(activeIdx + dir);
    });
  });

  const activateFromHash = () => {
    const hash = window.location.hash.replace('#', '');
    if (/^p[1-9]$/.test(hash)) {
      const idx = pcards.findIndex(c => c.dataset.tab === hash);
      if (idx >= 0) setActive(idx);
    }
  };
  window.addEventListener('hashchange', activateFromHash);
  activateFromHash();

  /* ---------- Product image gallery (swipeable) ---------- */
  document.querySelectorAll('[data-gallery]').forEach(gallery => {
    const track = gallery.querySelector('[data-gallery-track]');
    const slides = Array.from(gallery.querySelectorAll('.panel__slide'));
    const dots = Array.from(gallery.querySelectorAll('.panel__gallery-dot'));
    const prev = gallery.querySelector('[data-gallery-nav="prev"]');
    const next = gallery.querySelector('[data-gallery-nav="next"]');
    if (!track || slides.length < 2) return;

    const goTo = (idx) => {
      const clamped = (idx + slides.length) % slides.length;
      const slide = slides[clamped];
      if (!slide) return;
      track.scrollTo({ left: slide.offsetLeft, behavior: 'smooth' });
      slides.forEach((s, i) => s.classList.toggle('is-active', i === clamped));
      dots.forEach((d, i) => d.classList.toggle('is-active', i === clamped));
    };

    const currentIndex = () => {
      const w = track.clientWidth || 1;
      return Math.round(track.scrollLeft / w);
    };

    prev?.addEventListener('click', () => goTo(currentIndex() - 1));
    next?.addEventListener('click', () => goTo(currentIndex() + 1));
    dots.forEach((d, i) => d.addEventListener('click', () => goTo(i)));

    let scrollTick = false;
    track.addEventListener('scroll', () => {
      if (scrollTick) return;
      scrollTick = true;
      requestAnimationFrame(() => {
        const idx = currentIndex();
        slides.forEach((s, i) => s.classList.toggle('is-active', i === idx));
        dots.forEach((d, i) => d.classList.toggle('is-active', i === idx));
        scrollTick = false;
      });
    }, { passive: true });
  });

  /* ---------- Form helpers ---------- */
  const setNote = (note, text, state) => {
    if (!note) return;
    note.textContent = text;
    note.classList.remove('is-error', 'is-success');
    if (state) note.classList.add(state);
    note.style.color = '';
  };
  const markFieldError = (input, on) => {
    const row = input && input.closest('.form__row');
    if (row) row.classList.toggle('is-error', !!on);
  };
  const validateRequired = (formEl, fieldNames) => {
    let firstInvalid = null;
    fieldNames.forEach(name => {
      const input = formEl.querySelector(`[name="${name}"]`);
      if (!input) return;
      const value = (input.value || '').trim();
      const valid = !!value && (input.checkValidity ? input.checkValidity() : true);
      markFieldError(input, !valid);
      if (!valid && !firstInvalid) firstInvalid = input;
    });
    return firstInvalid;
  };
  const clearErrorsOnInput = (formEl) => {
    formEl.querySelectorAll('input, textarea').forEach(el => {
      el.addEventListener('input', () => markFieldError(el, false));
    });
  };
  const setBtnState = (btn, state, label) => {
    if (!btn) return;
    btn.classList.remove('is-loading', 'is-success');
    if (state === 'loading') {
      btn.disabled = true;
      btn.classList.add('is-loading');
      btn.innerHTML = '<span class="btn__spinner" aria-hidden="true"></span> Sending…';
    } else if (state === 'success') {
      btn.disabled = true;
      btn.classList.add('is-success');
      btn.innerHTML = '✓ Sent. We\'ll be in touch.';
    } else {
      btn.disabled = false;
      btn.innerHTML = label;
    }
  };

  const buildMailto = (subject, lines) => {
    const body = encodeURIComponent(lines.filter(Boolean).join('\n'));
    return `mailto:${FENCLY_FALLBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${body}`;
  };

  const postLead = async (payload) => {
    if (!FENCLY_FORM_ENDPOINT) {
      return { ok: false, reason: 'no-endpoint' };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      // text/plain body avoids a CORS preflight — required for Google Apps Script
      // web apps. The handler still parses it as JSON server-side.
      const res = await fetch(FENCLY_FORM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!res.ok) return { ok: false, reason: 'http-' + res.status };
      try {
        const json = await res.json();
        if (json && json.ok === false) return { ok: false, reason: json.error || 'server' };
      } catch (_) { /* non-JSON response — treat 2xx as success */ }
      return { ok: true };
    } catch (err) {
      clearTimeout(timeout);
      return { ok: false, reason: err.name === 'AbortError' ? 'timeout' : 'network' };
    }
  };

  const handleFallback = (note, btn, originalLabel, mailtoUrl, fallbackMessage) => {
    setNote(note, fallbackMessage, 'is-error');
    setBtnState(btn, 'idle', 'Email us instead →');
    if (btn) {
      const mailtoHandler = (e) => {
        e.preventDefault();
        window.location.href = mailtoUrl;
      };
      btn.addEventListener('click', mailtoHandler, { once: true });
    }
    setTimeout(() => {
      setBtnState(btn, 'idle', originalLabel);
    }, 12000);
  };

  /* ---------- Quote form ---------- */
  const form = document.getElementById('contactForm');
  const note = document.getElementById('formNote');
  if (form) {
    clearErrorsOnInput(form);
    let submitting = false;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (submitting) return;
      const invalid = validateRequired(form, ['name', 'email', 'phone', 'postcode']);
      if (invalid) {
        setNote(note, 'Please check the highlighted fields so we can quote you.', 'is-error');
        invalid.focus();
        return;
      }
      const btn = form.querySelector('button[type="submit"]');
      const original = btn ? btn.innerHTML : '';
      const data = new FormData(form);
      const name = data.get('name').toString().trim();
      const email = data.get('email').toString().trim();
      const phone = data.get('phone').toString().trim();
      const postcode = data.get('postcode').toString().trim();
      const suburb = (data.get('suburb') || '').toString().trim();
      const project = (data.get('project') || '').toString().trim();
      const length = (data.get('length') || '').toString().trim();
      const colour = (data.get('colour') || '').toString().trim();
      const message = (data.get('message') || '').toString().trim();

      const subject = `Fencly free measure & quote: ${name} (${postcode})`;
      const mailtoUrl = buildMailto(subject, [
        `Name: ${name}`,
        `Mobile: ${phone}`,
        `Email: ${email}`,
        `Suburb: ${suburb}`,
        `Postcode: ${postcode}`,
        `Project type: ${project}`,
        `Approx length: ${length}`,
        `Preferred colour: ${colour || '(not specified)'}`,
        '',
        message
      ]);

      const payload = {
        form: 'quote',
        name, email, phone, postcode, suburb, project, length, colour, message,
        _subject: subject,
        _replyto: email,
        page: location.href,
        submitted_at: new Date().toISOString()
      };

      if (!FENCLY_FORM_ENDPOINT) {
        window.location.href = mailtoUrl;
        setNote(note, 'Opening your email client… we usually reply within 4 business hours.', 'is-success');
        form.reset();
        setBtnState(btn, 'success');
        setTimeout(() => setBtnState(btn, 'idle', original), 8000);
        return;
      }

      submitting = true;
      setBtnState(btn, 'loading');
      setNote(note, 'Sending your details…');
      const result = await postLead(payload);
      submitting = false;

      if (result.ok) {
        setNote(note, 'Thanks, we\'ve got your details and will reply within 4 business hours.', 'is-success');
        form.reset();
        setBtnState(btn, 'success');
        setTimeout(() => setBtnState(btn, 'idle', original), 10000);
      } else {
        handleFallback(note, btn, original, mailtoUrl,
          'Something went wrong sending that. Tap below to email us directly. Your details are safe.');
      }
    });
  }

  /* ---------- Sample-kit form ---------- */
  const sForm = document.getElementById('sampleForm');
  const sNote = document.getElementById('sampleFormNote');
  if (sForm) {
    clearErrorsOnInput(sForm);
    let sSubmitting = false;
    sForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (sSubmitting) return;
      const invalid = validateRequired(sForm, ['name', 'email', 'business', 'abn', 'phone', 'address', 'postcode']);
      if (invalid) {
        setNote(sNote, 'Please check the highlighted fields. Trade sample sets require a verified ABN.', 'is-error');
        invalid.focus();
        return;
      }
      const btn = sForm.querySelector('button[type="submit"]');
      const original = btn ? btn.innerHTML : '';
      const data = new FormData(sForm);
      const name = data.get('name').toString().trim();
      const email = data.get('email').toString().trim();
      const business = (data.get('business') || '').toString().trim();
      const abn = (data.get('abn') || '').toString().trim();
      const phone = data.get('phone').toString().trim();
      const address = data.get('address').toString().trim();
      const postcode = data.get('postcode').toString().trim();

      const subject = `Fencly trade sample set: ${business || name} (ABN ${abn})`;
      const mailtoUrl = buildMailto(subject, [
        'Trade sample set request:',
        '',
        `Business: ${business}`,
        `ABN: ${abn}`,
        `Contact: ${name}`,
        `Email: ${email}`,
        `Mobile: ${phone}`,
        `Address: ${address}`,
        `Postcode: ${postcode}`
      ]);

      const payload = {
        form: 'trade-sample-set',
        name, email, business, abn, phone, address, postcode,
        _subject: subject,
        _replyto: email,
        page: location.href,
        submitted_at: new Date().toISOString()
      };

      if (!FENCLY_FORM_ENDPOINT) {
        window.location.href = mailtoUrl;
        setNote(sNote, 'Thanks. Opening your email client. We\'ll text the tracking link the moment it ships.', 'is-success');
        sForm.reset();
        setBtnState(btn, 'success');
        setTimeout(() => setBtnState(btn, 'idle', original), 8000);
        return;
      }

      sSubmitting = true;
      setBtnState(btn, 'loading');
      setNote(sNote, 'Sending your details…');
      const result = await postLead(payload);
      sSubmitting = false;

      if (result.ok) {
        setNote(sNote, 'Thanks, your sample set is being packed. We\'ll text the tracking link the moment it ships.', 'is-success');
        sForm.reset();
        setBtnState(btn, 'success');
        setTimeout(() => setBtnState(btn, 'idle', original), 10000);
      } else {
        handleFallback(sNote, btn, original, mailtoUrl,
          'Something went wrong sending that. Tap below to email us directly. Your details are safe.');
      }
    });
  }

  /* ---------- Comparison toggle ---------- */
  const toggleBtns = document.querySelectorAll('.compare__toggle-btn');
  const toggleRows = document.querySelectorAll('.compare__table tbody tr');
  if (toggleBtns.length) {
    const setView = (view) => {
      toggleBtns.forEach(b => {
        const on = b.dataset.view === view;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      // Lifetime view = show all rows. Upfront view = show only cost + warranty rows.
      toggleRows.forEach(r => {
        if (view === 'upfront') {
          const keep = ['cost', 'warranty'];
          r.style.display = keep.includes(r.dataset.row) ? '' : 'none';
        } else {
          r.style.display = '';
        }
      });
    };
    toggleBtns.forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
  }

  /* ---------- Year ---------- */
  const yr = document.getElementById('year');
  if (yr) yr.textContent = new Date().getFullYear();

  /* ---------- Smooth anchor with nav offset ---------- */
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (id.length <= 1) return;

      // Product shortcut: activate tab and scroll to #products
      if (/^#p[1-9]$/.test(id)) {
        const idx = pcards.findIndex(c => c.dataset.tab === id.slice(1));
        if (idx >= 0) {
          e.preventDefault();
          setActive(idx, { scrollCard: false });
          const ps = document.getElementById('products');
          if (ps) {
            const y = ps.getBoundingClientRect().top + window.scrollY - 72;
            window.scrollTo({ top: y, behavior: 'smooth' });
          }
          return;
        }
      }

      const el = document.querySelector(id);
      if (!el) return;
      e.preventDefault();
      const y = el.getBoundingClientRect().top + window.scrollY - 72;
      window.scrollTo({ top: y, behavior: 'smooth' });
    });
  });

})();
