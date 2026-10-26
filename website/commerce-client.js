// Public consumer forms. No session, account API, cookies or browser storage.
document.querySelectorAll('[data-commerce-notice]').forEach(form=>{
 const kind=form.dataset.commerceNotice,status=form.querySelector('[data-notice-status]'),submit=form.querySelector('[type="submit"]');
 let prior='',nonce='',saved='';
 const update=()=>{
  const date=form.querySelector('[data-end-date]'),reason=form.querySelector('[data-cancellation-reason]');
  if(date){date.hidden=form.elements.endChoice.value!=='date';form.elements.endDate.required=!date.hidden;}
  if(reason){reason.hidden=form.elements.termination.value!=='extraordinary';if(reason.hidden)form.elements.reason.value='';}
 };
 form.addEventListener('change',update);update();
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(!form.reportValidity())return;
  const fields={kind,name:form.elements.name.value.trim(),email:form.elements.email.value.trim(),reference:form.elements.reference.value.trim()};
  if(kind==='cancel')Object.assign(fields,{termination:form.elements.termination.value,end:form.elements.endChoice.value==='date'?form.elements.endDate.value:'earliest',reason:form.elements.reason.value.trim()});
  const canonical=JSON.stringify(fields);if(canonical!==prior){nonce=crypto.randomUUID();prior=canonical;}
  submit.disabled=true;status.textContent='Sending your declaration…';
  try{
   const response=await fetch('https://your-project.supabase.co/functions/v1/commerce-notice',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({...fields,id:nonce}),signal:AbortSignal.timeout(20000)});
   const result=await response.json();
   if(!response.ok||result.received!==true||result.id!==nonce||typeof result.receipt!=='string')throw Error(response.status===429?'rate_limited':'not_confirmed');
   saved=result.receipt;form.querySelector('[data-notice-receipt]').textContent=saved;form.querySelector('[data-notice-confirmation]').hidden=false;
   status.textContent=result.deliveryPending?'Your declaration has been received and saved. The email copy is pending; download your confirmation now.':'Your declaration has been received and saved. Your email confirmation has been sent. You can also download it below.';
  }catch(error){status.textContent=error.message==='rate_limited'?'Too many submissions. You can send your declaration to support@onyxchat.site instead.':'We could not confirm receipt. Retry with the same details or email support@onyxchat.site. No successful submission is claimed.';}
  finally{submit.disabled=false;}
 });
 form.querySelector('[data-notice-download]').addEventListener('click',()=>{
  if(!saved)return;const url=URL.createObjectURL(new Blob([saved],{type:'text/plain;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='ONYX-confirmation-'+nonce+'.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 });
});
