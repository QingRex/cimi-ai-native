import {join} from 'node:path';
export const CODEX_PRIVATE_USER_ENVIRONMENT_POLICY='private_user_directories/1.0.0' as const;
export function codexPrivateUserEnvironment(cwd:string,loginHome:string){const state=join(cwd,'..','state'),user=join(state,'user');return{
 HOME:user,USERPROFILE:user,LOCALAPPDATA:join(user,'AppData','Local'),APPDATA:join(user,'AppData','Roaming'),PROGRAMDATA:join(state,'program-data'),TEMP:join(state,'temp'),TMP:join(state,'temp'),CODEX_HOME:loginHome
};}
export function codexPrivateUserDirectories(cwd:string){const environment=codexPrivateUserEnvironment(cwd,'unused-login-path');return [...new Set(Object.entries(environment).filter(([key])=>key!=='CODEX_HOME').map(([,path])=>path))];}
// Windows redirects the lowbox TEMP under the inherited private LOCALAPPDATA.
// The name belongs to this original launch, not an adopted OS Profile or a
// caller path. Prepare it inside the existing state write root before resume.
export function codexPrivateAppContainerTemp(cwd:string,nonce:string){
 if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(nonce))throw Error('codex_process_custody_unproven');
 return join(codexPrivateUserEnvironment(cwd,'unused-login-path').LOCALAPPDATA,'Packages','cimiloop.codexwrite.'+nonce.replaceAll('-',''),'AC','Temp');
}
