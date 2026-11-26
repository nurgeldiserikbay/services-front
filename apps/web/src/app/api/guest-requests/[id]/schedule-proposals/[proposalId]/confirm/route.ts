import {NextRequest,NextResponse} from 'next/server';
import {handleGuestSchedule} from '@/lib/guest-schedule-route.server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
export async function POST(request:NextRequest,context:{params:Promise<{id:string;proposalId:string}> }):Promise<NextResponse>{
 const {id,proposalId}=await context.params;
 return handleGuestSchedule(request,id,'confirm',proposalId);
}
