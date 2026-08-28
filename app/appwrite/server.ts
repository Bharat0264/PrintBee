import { Account, Client, OAuthProvider } from "node-appwrite";

function config() {
  const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
  const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
  const apiKey = process.env.APPWRITE_API_KEY;
  if (!endpoint || !projectId || !apiKey) throw new Error("Appwrite is not configured.");
  return { endpoint, projectId, apiKey };
}

export function createAppwriteAdminAccount() {
  const { endpoint, projectId, apiKey } = config();
  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  return new Account(client);
}

export { OAuthProvider };
