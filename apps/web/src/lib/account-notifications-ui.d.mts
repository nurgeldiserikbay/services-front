import type {AccountNotificationPage} from './account-notifications-transport.mjs';
export function readNotificationBrowserReply(response:Response):Promise<AccountNotificationPage>;
export function notificationTopicLabel(locale:'kk'|'ru',topic:string):string;
