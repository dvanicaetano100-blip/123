const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const PUBLIC_DIR = path.join(__dirname, "public");
const SYSTEM_PROMPT = `Você é Luna, uma companheira virtual com personalidade engraçada, brincalhona, espontânea e gentil.
Fale sempre em português brasileiro natural, a menos que a pessoa peça outro idioma.
Use humor leve, brincadeiras carinhosas e respostas úteis. Não force piadas em assuntos sérios.
Não afirme ser humana nem ter consciência ou sentimentos humanos. Você é uma IA.
A pessoa usuária prefere chamar você de Luna. Seja breve por padrão, como numa conversa por voz.
Não diga que executou ações que não executou.`;

const MIME = {".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".txt":"text/plain; charset=utf-8"};
function send(res, status, data, type="application/json; charset=utf-8") {
  res.writeHead(status, {"Content-Type":type,"X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","Cache-Control":"no-store"});
  res.end(type.startsWith("application/json") ? JSON.stringify(data) : data);
}
function readBody(req, max=50000) {
  return new Promise((resolve,reject)=>{
    let body="", tooLarge=false;
    req.on("data",chunk=>{body+=chunk;if(body.length>max){tooLarge=true;reject(new Error("Corpo muito grande"));req.destroy();}});
    req.on("end",()=>{if(tooLarge)return;try{resolve(JSON.parse(body||"{}"));}catch{reject(new Error("JSON inválido"));}});
    req.on("error",reject);
  });
}
const server = http.createServer(async (req,res)=>{
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if(req.method==="GET" && url.pathname==="/api/health") return send(res,200,{ok:true,configured:Boolean(API_KEY),model:MODEL});
  if(req.method==="POST" && url.pathname==="/api/chat"){
    if(!API_KEY || API_KEY==="cole_sua_chave_aqui") return send(res,503,{error:"A IA online ainda não foi configurada. Adicione OPENAI_API_KEY no ambiente do servidor."});
    let body;
    try{body=await readBody(req);}catch(e){return send(res,400,{error:e.message});}
    const messages=Array.isArray(body.messages)?body.messages.slice(-16):[];
    if(!messages.length) return send(res,400,{error:"Envie pelo menos uma mensagem."});
    const input=[];
    for(const m of messages){
      if(!m || !["user","assistant"].includes(m.role) || typeof m.content!=="string") continue;
      input.push({role:m.role,content:m.content.slice(0,4000)});
    }
    if(!input.length || input[input.length-1].role!=="user") return send(res,400,{error:"A última mensagem precisa ser do usuário."});
    try{
      const response=await fetch("https://api.openai.com/v1/responses",{
        method:"POST",
        headers:{"Authorization":`Bearer ${API_KEY}`,"Content-Type":"application/json"},
        body:JSON.stringify({model:MODEL,instructions:SYSTEM_PROMPT,input,max_output_tokens:350})
      });
      const data=await response.json();
      if(!response.ok){
        const message=data && data.error && data.error.message ? data.error.message : "Falha no serviço de IA.";
        return send(res,502,{error:`A IA não respondeu: ${message}`});
      }
      let answer=typeof data.output_text==="string"?data.output_text:"";
      if(!answer && Array.isArray(data.output)){
        for(const item of data.output) for(const c of (item.content||[])) if(c.type==="output_text") answer+=c.text;
      }
      if(!answer.trim()) return send(res,502,{error:"A IA retornou uma resposta vazia. Tente novamente."});
      return send(res,200,{reply:answer.trim()});
    }catch(e){return send(res,502,{error:"Não consegui conectar à IA online. Confira a conexão e tente novamente."});}
  }
  if(req.method==="GET"){
    const requested=url.pathname==="/"?"/index.html":url.pathname;
    const file=path.resolve(PUBLIC_DIR,"."+requested);
    if(!file.startsWith(PUBLIC_DIR+path.sep) && file!==path.join(PUBLIC_DIR,"index.html")) return send(res,403,{error:"Acesso negado."});
    fs.readFile(file,(err,data)=>{if(err)return send(res,404,{error:"Arquivo não encontrado."});send(res,200,data,MIME[path.extname(file)]||"application/octet-stream");});
    return;
  }
  send(res,405,{error:"Método não permitido."});
});
server.listen(PORT,"0.0.0.0",()=>console.log(`Luna rodando na porta ${PORT}. Abra http://localhost:${PORT}`));
