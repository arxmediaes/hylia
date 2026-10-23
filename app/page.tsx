import Hylia from './ui';
import {getChatGPTUser} from './chatgpt-auth';
export const dynamic='force-dynamic';
export default async function Page(){const user=await getChatGPTUser();return <Hylia user={user?.displayName||null}/>;}
