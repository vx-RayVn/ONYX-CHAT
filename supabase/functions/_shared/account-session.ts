/** Call only after Auth.getUser(jwt) has verified the token. Never trust decoded claims alone. */
export async function accountSessionAllowed(jwt:string,userId:string,rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:unknown}>){
 try{
  const part=jwt.split('.')[1];if(!part||part.length>20000)return false;
  const claims=JSON.parse(atob(part.replace(/-/g,'+').replace(/_/g,'/')));
  if(claims.sub!==userId||claims.role!=='authenticated'||typeof claims.session_id!=='string'||!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(claims.session_id))return false;
  const result=await rpc('account_session_check',{p_user:userId,p_session:claims.session_id,p_aal:claims.aal??'aal1'});
  return !result.error&&result.data===true;
 }catch{return false;}
}
