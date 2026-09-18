document.documentElement.dataset.js='on';
const nav=document.querySelector('.site-nav');
const syncNav=()=>nav?.classList.toggle('scrolled',window.scrollY>24);
syncNav();window.addEventListener('scroll',syncNav,{passive:true});

const menuButton=document.querySelector('.menu-toggle');
const navLinks=document.querySelector('#nav-links');
const closeMenu=()=>{
  navLinks?.classList.remove('open');
  menuButton?.setAttribute('aria-expanded','false');
};
menuButton?.addEventListener('click',()=>{
  const open=navLinks.classList.toggle('open');
  menuButton.setAttribute('aria-expanded',String(open));
});
navLinks?.addEventListener('click',event=>{
  if(event.target.closest('a'))closeMenu();
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape' && navLinks?.classList.contains('open')){
    closeMenu();menuButton.focus();
  }
});

const qrButton=document.querySelector('#qr-toggle');
const qrPanel=document.querySelector('#qr-panel');
qrButton?.addEventListener('click',()=>{
  const open=qrPanel.classList.toggle('open');
  qrButton.setAttribute('aria-expanded',String(open));
  qrButton.textContent=open?'QRコードを閉じる':'QRコードを表示';
});
