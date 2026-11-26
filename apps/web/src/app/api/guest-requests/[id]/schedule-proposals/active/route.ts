import {NextRequest,NextResponse} from 'next/server';
import {handleGuestScheduleRead} from '@/lib/guest-schedule-route.server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
export async function POST(request:NextRequest,context:{params:Promise<{id:string}> }):Promise<NextResponse>{
 const {id}=await context.params;
 return handleGuestScheduleRead(request,id);
}
