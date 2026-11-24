/** A completion POST may commit before an HTTP timeout or disconnect.
 * Only a fresh server-rendered request version may authorize a new attempt.
 */
export function canAttemptCustomerCompletion(status,inFlight){
 return status==='idle'&&inFlight===false;
}
