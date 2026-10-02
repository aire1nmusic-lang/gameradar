/** Reversible application circuit breaker. Payment acknowledgements remain available. */
export function emergencyBlocks(method,path,enabled) {
  if(!enabled||['GET','HEAD','OPTIONS'].includes(method))return false
  if(method==='POST'&&path==='/api/v1/payments/robokassa/result')return false
  if(method==='POST'&&['/api/v1/auth/login','/api/v1/auth/logout'].includes(path))return false
  // Existing per-route admin permissions still apply; emergencies must not lock out moderation.
  if(path.startsWith('/api/v1/admin/'))return false
  return path.startsWith('/api/v1/')
}
export function emergencyLimit(max,enabled) {
  return enabled?Math.max(1,Math.floor(max/4)):max
}
