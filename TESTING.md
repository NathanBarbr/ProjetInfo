# Guide de Tests - PingPong Video Platform

Ce guide complet couvre **tous les types de tests** : unitaires, d'intégration et end-to-end (E2E).

## 📁 Structure Complète des Tests

```
ProjetInfo/
├── backend/tests/
│   ├── conftest.py                    # Fixtures tests unitaires
│   ├── test_videos.py                 # Tests unitaires videos
│   ├── test_search.py                 # Tests unitaires search
│   ├── test_chat.py                   #Tests unitaires chat
│   └── integration/
│       ├── conftest.py                # Fixtures integration
│       ├── test_api_integration.py    # Tests API réels
│       └── test_elasticsearch_integration.py  # Tests ES réels
│
├── tests/e2e/
│   ├── video-playback.spec.ts         # E2E lecture vidéo
│   ├── search-flow.spec.ts            # E2E recherche
│   └── chat-interaction.spec.ts       # E2E chatbot
│
└── playwright.config.ts               # Configuration Playwright
```

## 🎯 Types de Tests (Pyramide)

```
     /\
    /E2E\        ← ~10-15 scénarios critiques (lent)
   /------\
  /Intégra\     ← ~20-30 tests de flux (moyen)
 /----------\
/ Unitaires  \  ← >80 tests rapides (rapide)
```

---

## 🚀 Commandes Rapides

### Tests Unitaires Backend
```bash
cd backend && .\venv\Scripts\activate
pytest tests/ -v -m "not integration"  # Uniquement unitaires
```

### Tests d'Intégration Backend
```bash
# Démarrer Elasticsearch d'abord !
docker-compose up -d elasticsearch

cd backend && .\venv\Scripts\activate
pytest tests/integration/ -v -m integration
```

### Tests E2E
```bash
# Installer Playwright (première fois)
npm install
npx playwright install

# Lancer les tests E2E
npm run test:e2e

# Mode UI interactif
npm run test:e2e:ui

#Mode visible (voir le navigateur)
npm run test:e2e:headed
```

---

## 📖 Guide Détaillé

### 1. Tests Unitaires Backend (26 tests ✅)

**Installation** :
```bash
cd backend
.\venv\Scripts\activate
pip install -r requirements.txt
```

**Commandes** :
```bash
# Tous les tests unitaires
pytest tests/ -v -m "not integration"

# Un fichier spécifique
pytest tests/test_videos.py -v

# Avec couverture
pytest --cov=routers --cov-report=html
```

**Écrire un test** :
```python
import pytest

class TestMyFeature:
    def test_something(self, client):
        response = client.get("/api/endpoint")
        assert response.status_code == 200
```

---

### 2. Tests d'Intégration Backend

**Prérequis** : Elasticsearch doit tourner !
```bash
docker-compose up -d elasticsearch
```

**Commandes** :
```bash
# Tous les tests d'intégration
pytest tests/integration/ -v -m integration

# Tester seulement Elasticsearch
pytest tests/integration/test_elasticsearch_integration.py -v

# Tester seulement l'API
pytest tests/integration/test_api_integration.py -v
```

**Exemple** :
```python
import pytest

pytestmark = pytest.mark.integration

def test_real_elasticsearch(es_client, es_test_index):
    # Test avec vrai ES
    result = es_client.search(index=es_test_index, ...)
    assert result["hits"]["total"]["value"] > 0
```

---

### 3. Tests E2E avec Playwright

**Installation** :
```bash
# Installer les dépendances
npm install

# Installer les navigateurs
npx playwright install
```

**Configuration** : Les serveurs backend (port 8001) et frontend (port 3000) démarrent automatiquement via `playwright.config.ts`.

**Commandes** :
```bash
# Lancer tous les E2E
npm run test:e2e

# Mode UI (recommandé pour debug)
npm run test:e2e:ui

# Voir le navigateur pendant les tests
npm run test:e2e:headed

# Debug pas-à-pas
npm run test:e2e:debug

# Un seul fichier
npx playwright test video-playback.spec.ts
```

**Exemple de test** :
```typescript
import { test, expect } from '@playwright/test';

test('should play video', async ({ page }) => {
  await page.goto('/');
  await page.click('[data-testid="video-card"]');
  
  const video = page.locator('video');
  await expect(video).toBeVisible();
});
```

---

## 📊 Stratégie de Tests

| Type | Objectif | Vitesse | Nombre |
|------|----------|---------|--------|
| Unitaires | Composants isolés | Rapide (<1s) | >80 tests |
| Intégration | Connexions réelles | Moyen (1-5s) | ~20-30 tests |
| E2E | Scénarios utilisateur | Lent (5-30s) | ~10-15 tests |

**Quand utiliser quoi ?**
- ✅ **Unitaire** : Logique métier, fonctions, composants isolés
- ✅ **Intégration** : API + DB, ES queries, flux de données
- ✅ **E2E** : Parcours utilisateur critiques (login, recherche, lecture)

---

## 🔍 Markers Pytest

```bash
# Uniquement tests unitaires (rapides)
pytest -m unit

# Uniquement tests d'intégration
pytest -m integration

# Tous sauf integration
pytest -m "not integration"

# Tests lents seulement
pytest -m slow
```

---

## 🆘 Troubleshooting

**Backend - `ModuleNotFoundError`**
→ Activer le venv : `.\venv\Scripts\activate`

**Integration - `Elasticsearch not available`**
→ Démarrer ES : `docker-compose up -d elasticsearch`

**E2E - `Cannot find @playwright/test`**
→ Installer : `npm install` puis `npx playwright install`

**E2E - Serveurs ne démarrent pas**
→ Vérifier que ports 3000 et 8001 sont libres

---

## 📚 Ressources

- [Pytest](https://docs.pytest.org/)
- [FastAPI Testing](https://fastapi.tiangolo.com/tutorial/testing/)
- [Playwright](https://playwright.dev/)
- [React Testing Library](https://testing-library.com/)

---

## ✅ Checklist Rapide

- [ ] Installer les dépendances backend (`pip install -r requirements.txt`)
- [ ] Installer les dépendances frontend (`npm install`)
- [ ] Installer Playwright (`npx playwright install`)
- [ ] Lancer tests unitaires backend (`pytest -m "not integration"`)
- [ ] Démarrer Elasticsearch (`docker-compose up -d`)
- [ ] Lancer tests d'intégration (`pytest -m integration`)
- [ ] Lancer tests E2E (`npm run test:e2e`)

Bon testing ! 🚀
