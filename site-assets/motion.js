/* Shared, progressive motion: content never depends on animation to be visible. */
(() => {
  'use strict';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!Element.prototype.animate) return;
  const played = new WeakSet();
  const running = new Map();
  let observer;

  function reveal(element, delay = 0) {
    if (reduced.matches || element.hidden || !element.getClientRects().length) return;
    running.get(element)?.cancel();
    const animation = element.animate([
      { opacity: .35, transform: 'translateY(16px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ], { duration: 540, delay, fill: 'backwards', easing: 'cubic-bezier(.22,1,.36,1)' });
    running.set(element, animation);
    const release = () => {
      if (running.get(element) === animation) running.delete(element);
    };
    animation.onfinish = release;
    animation.oncancel = release;
  }

  function start() {
    observer?.disconnect();
    if (reduced.matches) {
      running.forEach(animation => animation.cancel());
      running.clear();
      return;
    }
    // Hero content is visible immediately; small delays add a reading rhythm.
    document.querySelectorAll('.hero-copy > *, .hero-feature, .hero-person').forEach((element, index) => {
      if (played.has(element)) return;
      played.add(element);
      reveal(element, Math.min(index, 4) * 65);
    });
    if (!('IntersectionObserver' in window)) return;
    observer = new IntersectionObserver(entries => {
      let order = 0;
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const element = entry.target;
        observer.unobserve(element);
        if (played.has(element)) return;
        played.add(element);
        reveal(element, Math.min(order++, 3) * 65);
      });
    }, { threshold: 0, rootMargin: '0px 0px -32px 0px' });
    document.querySelectorAll(
      '.section-head, .preview, .card, .service, .flow-step, .scope-col, ' +
      '.profile-intro, .faq details, .work-card, #works .center-text, .linkout-card'
    ).forEach(element => {
      if (!played.has(element)) observer.observe(element);
    });
  }

  // Filtering keeps the original hidden/aria state; only visible results animate.
  document.addEventListener('click', event => {
    if (!(event.target instanceof Element) || !event.target.closest('.tag-filter button')) return;
    requestAnimationFrame(() => {
      document.querySelectorAll('.work-card:not([hidden])').forEach((element, index) => {
        played.add(element);
        observer?.unobserve(element);
        reveal(element, Math.min(index, 3) * 55);
      });
    });
  });
  // Keyboard focus must never wait for a decorative entrance to finish.
  document.addEventListener('focusin', event => {
    running.forEach((animation, element) => {
      if (element.contains(event.target)) animation.cancel();
    });
  });
  reduced.addEventListener('change', start);
  window.addEventListener('beforeprint', () => {
    running.forEach(animation => animation.cancel());
    running.clear();
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
