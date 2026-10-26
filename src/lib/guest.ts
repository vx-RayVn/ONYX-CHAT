import type {Permission} from '../types';
export const GUEST_PERMISSIONS:ReadonlySet<Permission>=new Set(['viewChannel','readHistory','sendMessages','connect','speak','video','screenShare']);
export const guestPermissions=(permissions:Set<Permission>,guest?:boolean)=>guest?new Set([...permissions].filter(p=>GUEST_PERMISSIONS.has(p))):permissions;
