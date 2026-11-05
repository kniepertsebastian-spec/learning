import webpush from "web-push";

/** Erzeugt ein VAPID-Schlüsselpaar für Web Push. Usage: npm run push:keys  (Ausgabe in die .env übernehmen; der private Schlüssel ist geheim) */
const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log("VAPID_SUBJECT=mailto:admin@example.com   # eine Adresse, unter der der Betreiber erreichbar ist");
