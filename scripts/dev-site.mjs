import {createServer} from 'node:http';
import {mkdirSync,existsSync,readFileSync} from 'node:fs';
mkdirSync('output/dev-site/.well-known',{recursive:true});
const file='output/dev-site/.well-known/gamescout-verification.txt';
createServer((req,res)=>{
 if(req.url!=='/.well-known/gamescout-verification.txt'||!existsSync(file)){res.writeHead(404);return res.end('Place the claim token in '+file);}
 res.writeHead(200,{'Content-Type':'text/plain','Cache-Control':'no-store'});res.end(readFileSync(file));
}).listen(8790,'127.0.0.1',()=>console.log('Local FILE verification site: http://127.0.0.1:8790. Token file: '+file));
