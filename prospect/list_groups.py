import urllib.request
import json

headers = {
    "apikey": "b42366c11ffbe9fb3def9b655d3002c3d26dd9f17581e2e0b575c60fb3421859",
    "Content-Type": "application/json"
}

def get_groups():
    url = "http://127.0.0.1/api/group/fetchAllGroups/tracktrek?getParticipants=false"
    req = urllib.request.Request(url, headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))

def get_chats():
    url = "http://127.0.0.1/api/chat/findChats/tracktrek"
    req = urllib.request.Request(url, headers=headers, method="POST", data=b"{}")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        return []

groups = get_groups()
print("=== GROUPES TROUVÉS (fetchAllGroups) ===")
print(f"Total: {len(groups)}")
for g in groups:
    gid = g.get("id") or g.get("jid")
    name = g.get("subject") or g.get("name")
    print(f"ID: {gid} | Nom: {name}")

chats = get_chats()
group_chats = [c for c in chats if "@g.us" in (c.get("id") or c.get("remoteJid") or "")]
if group_chats and len(group_chats) != len(groups):
    print("\n=== AUTRES GROUPES VIA CHATS ===")
    for c in group_chats:
        cid = c.get("id") or c.get("remoteJid")
        cname = c.get("name") or c.get("pushName") or cid
        print(f"ID: {cid} | Nom: {cname}")
