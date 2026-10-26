// Only relay the signed OpenID response. Identity verification and linking happen on the server.
const params=new URLSearchParams(location.search);
if(location.search.length<=20000&&params.getAll('state').length===1&&/^[A-Za-z0-9_-]{43}$/.test(params.get('state')??'')){
 const target=new URL('https://your-project.supabase.co/functions/v1/connections/callback/steam');
 target.search=params.toString();location.replace(target.href);
}else location.replace('https://onyxchat.site/#connection=failed');
