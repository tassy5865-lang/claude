document.documentElement.dataset.js='on';
const nav=document.querySelector('.site-nav');
const syncNav=()=>nav?.classList.toggle('scrolled',window.scrollY>24);
syncNav();window.addEventListener('scroll',syncNav,{passive:true});

const qrButton=document.querySelector('#qr-toggle');
const qrPanel=document.querySelector('#qr-panel');
qrButton?.addEventListener('click',()=>{
  const open=qrPanel.classList.toggle('open');
  qrButton.setAttribute('aria-expanded',String(open));
  qrButton.textContent=open?'QRコードを閉じる':'QRコードを表示';
});
