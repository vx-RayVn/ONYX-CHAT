/** Local test server. Browsers may reset sockets when closing a context. */
import {createServer} from 'vite';
// Isolated upload builds contain their own index.html/tsconfig. They must not
// trigger an unrelated browser reload while a touch action is being tested.
const server=await createServer({server:{host:'127.0.0.1',port:5173,strictPort:true,watch:{ignored:['**/.tools/**','**/test-results/**','**/supabase/templates/preview/**','**/youtube/**','**/desktop/**']}}});
server.httpServer.on('connection',socket=>socket.on('error',error=>{
  // A reset connection is normal during browser teardown, not an application exception.
  if(error.code!=='ECONNRESET')console.error('[e2e socket]',error);
}));
await server.listen();
server.printUrls();
