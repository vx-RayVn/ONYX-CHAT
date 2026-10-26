import {supabase} from './client';
import {t} from '../i18n';
export type BugCategory='general'|'mobile'|'voice'|'security'|'account';
export type BugStatus='open'|'confirmed'|'not_bug';
export interface BugReport {id:string;reporter_id:string;category:BugCategory;title:string;description:string;environment:string;status:BugStatus;reply:string;created_at:string;updated_at:string}
export const BUG_CATEGORIES:BugCategory[]=['general','mobile','voice','security','account'];
export const BUG_STATUSES:BugStatus[]=['open','confirmed','not_bug'];
export function bugCategoryLabel(category:BugCategory){return ({general:t('General'),mobile:t('Mobile & tablet'),voice:t('Voice & video'),security:t('Security'),account:t('Account & access')})[category];}
export function bugStatusLabel(status:BugStatus){return ({open:t('Open'),confirmed:t('Actual bug · Working on it'),not_bug:t('Not a bug')})[status];}
export async function loadBugReports(owner:string,admin:boolean,offset=0,status?:BugStatus){
 let query=supabase().from('bug_reports').select('id,reporter_id,category,title,description,environment,status,reply,created_at,updated_at').order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+24);
 if(!admin)query=query.eq('reporter_id',owner);if(status)query=query.eq('status',status);
 const {data,error}=await query;if(error)throw Error(t('Couldn’t load reports.'));return (data??[]) as BugReport[];
}
export async function submitBugReport(id:string,category:BugCategory,title:string,description:string,environment:string){
 const {data,error}=await supabase().rpc('submit_bug_report',{p_id:id,p_category:category,p_title:title,p_description:description,p_environment:environment});
 if(error)throw Error(error.message.includes('rate limited')?t('You can send up to five reports per hour. Please try again later.'):t('Couldn’t send your report. Your text is still here.'));
 return data as string;
}
export async function updateBugReport(id:string,status:BugStatus,reply:string){const {error}=await supabase().rpc('set_bug_report_status',{p_id:id,p_status:status,p_reply:reply});if(error)throw Error(t('Couldn’t update this report.'));}
