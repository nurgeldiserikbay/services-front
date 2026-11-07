export class NotificationTransportUnavailable extends Error{}
export class NotificationTransportUnauthorized extends Error{}
export type AccountNotification={id:string;topic:string;subject_id:string;created_at:string};
export type AccountNotificationPage={items:AccountNotification[]};
export function validateNotificationInbox(value:unknown):AccountNotificationPage;
export function fetchAccountNotifications(options:{
 baseUrl:string;production?:boolean;accountBearer:string;limit?:number;
 transport?:typeof fetch;
}):Promise<AccountNotificationPage>;
