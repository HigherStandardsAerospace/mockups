(() => {
  const root = document.documentElement;
  const progress = document.querySelector('.progress span');
  const journey = document.querySelector('.journey-track');
  const stage = document.querySelector('.depth-stage');

  const updateMotion = () => {
    const y = window.scrollY;
    const max = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    root.style.setProperty('--hero-scroll', y.toFixed(1));
    root.style.setProperty('--progress', `${(y / max) * 100}%`);
    if (journey && stage) {
      const rect = journey.getBoundingClientRect();
      const range = Math.max(journey.offsetHeight - window.innerHeight, 1);
      const journeyProgress = Math.min(1, Math.max(0, -rect.top / range));
      stage.style.setProperty('--journey', journeyProgress.toFixed(3));
    }
  };

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(() => { updateMotion(); ticking = false; });
      ticking = true;
    }
  }, { passive: true });
  updateMotion();

  document.querySelectorAll('.tilt-card').forEach((card) => {
    const reset = () => { card.style.transform = ''; };
    card.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch') return;
      const box = card.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width - .5;
      const y = (event.clientY - box.top) / box.height - .5;
      card.style.transform = `rotateX(${(-y * 7).toFixed(2)}deg) rotateY(${(x * 8).toFixed(2)}deg) translateY(-5px)`;
    });
    card.addEventListener('pointerleave', reset);
    card.addEventListener('pointercancel', reset);
  });
})();
