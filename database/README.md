Base MySQL Rose&Bleu

Ce dossier contient le premier schema SQL pour le backend du projet.

Fichiers
- `database/schema.sql` : schema relationnel complet + index principaux + categories initiales.

Creation de la base
1. Verifie que MySQL 8+ est demarre.
2. Execute :

```bash
mysql -u root -p < database/schema.sql
```

Notes
- Nom de base utilise dans le script : `roseetbleu`.
- Charset/collation : `utf8mb4` / `utf8mb4_unicode_ci`.
- L'auth admin est geree dans `users` :
  - `users.role = 'admin'`
  - `users.admin_access_key_hash` (stocker le hash bcrypt de la cle admin, jamais la cle en clair)
  - les comptes admin sont ajoutes manuellement.
- Les prix sont stockes en `DECIMAL(12,2)`.
- Le stock est gere par variante (`product_variants.stock_qty`) avec historique dans `inventory_movements`.

Insertion manuelle d'un admin (exemple)
```sql
INSERT INTO users (
  first_name, last_name, email, password_hash, admin_access_key_hash, role, status
) VALUES (
  'Admin', 'RoseBleu', 'admin@roseetbleu.com',
  '$2b$12$replace_with_password_hash',
  '$2b$12$replace_with_admin_key_hash',
  'admin', 'active'
);
```

Prochaine etape backend recommandee
- Creer un pool MySQL dans Node (`mysql2/promise`) puis ajouter les fonctions repository pour :
  - inscription/connexion users
  - listing/details produits
  - panier (ajout/suppression/mise a jour)
  - creation commande + lignes de commande
  - lecture/mise a jour admin produits/commandes/users
