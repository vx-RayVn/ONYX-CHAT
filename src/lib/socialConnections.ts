export type ConnectionProvider='steam'|'twitch'|'youtube'|'spotify'|'epic'|'xbox'|'riot';
export interface ProfileConnection {user_id:string;provider:ConnectionProvider;external_id:string;display_name:string|null;profile_handle:string|null;is_visible:boolean}
export function connectionURL(item:ProfileConnection):string|null {
 const id=encodeURIComponent(item.external_id),handle=item.profile_handle?encodeURIComponent(item.profile_handle):null;
 switch(item.provider){
  case 'steam':return `https://steamcommunity.com/profiles/${id}`;
  case 'twitch':return handle?`https://www.twitch.tv/${handle}`:null;
  case 'youtube':return `https://www.youtube.com/channel/${id}`;
  case 'spotify':return handle?`https://open.spotify.com/user/${handle}`:null;
  case 'xbox':return handle?`https://account.xbox.com/profile?gamertag=${handle}`:null;
  default:return null;
 }
}
