/** ONYX product policy: 16 everywhere. This is a self-declaration, not identity verification. */
export const MIN_AGE=16;
export function birthDateIssue(value:string,now=new Date()):'date_required'|'date_invalid'|'minimum_age'|null{
 if(!value)return 'date_required';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return 'date_invalid';
 const [y,m,d]=value.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d));
 if(y<1900||date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d||date>now)return 'date_invalid';
 const age=now.getUTCFullYear()-y-(now.getUTCMonth()+1<m||now.getUTCMonth()+1===m&&now.getUTCDate()<d?1:0);
 return age<MIN_AGE?'minimum_age':null;
}
