/* Appearance only: no account or financial information is stored locally. */
(()=>{
 const key='jk-cred-theme';
 function apply(value,persist=false){const theme=value==='light'?'light':'dark';document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=theme==='light'?'#f5f3ee':'#111210';if(persist){try{localStorage.setItem(key,theme);}catch{}}document.querySelectorAll('[data-theme-option]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.themeOption===theme)));return theme;}
 let saved='dark';try{saved=localStorage.getItem(key)||'dark';}catch{}
 apply(saved);
 window.JKTheme=Object.freeze({get:()=>document.documentElement.dataset.theme,set:theme=>apply(theme,true)});
})();
