document.documentElement.dataset.js='on';
const nav=document.querySelector('.site-nav');
const syncNav=()=>nav?.classList.toggle('scrolled',window.scrollY>24);
syncNav();window.addEventListener('scroll',syncNav,{passive:true});

const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if(!reduced&&'IntersectionObserver'in window){
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target)}}),{threshold:.12});
  document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));
}else document.querySelectorAll('.reveal').forEach(el=>el.classList.add('visible'));

const qrButton=document.querySelector('#qr-toggle');
const qrPanel=document.querySelector('#qr-panel');
qrButton?.addEventListener('click',()=>{
  const open=qrPanel.classList.toggle('open');
  qrButton.setAttribute('aria-expanded',String(open));
  qrButton.textContent=open?'QRコードを閉じる':'QRコードを表示';
});
