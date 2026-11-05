import uuid

import httpx

base = "http://127.0.0.1:8000"
email = f"phase1_{uuid.uuid4().hex[:8]}@example.com"
password = "password123"

with httpx.Client(base_url=base, timeout=30.0) as c:
    r = c.post("/api/auth/register", json={"email": email, "password": password})
    r.raise_for_status()
    token = r.json()["access_token"]
    h = {"Authorization": f"Bearer {token}"}

    me = c.get("/api/auth/me", headers=h)
    me.raise_for_status()

    site = c.post(
        "/api/websites",
        headers=h,
        json={"base_url": "https://acme-demo.test", "ownership_confirmed": True},
    )
    site.raise_for_status()

    key = f"idem-{uuid.uuid4()}"
    job = c.post("/api/jobs", headers=h, json={"job_type": "demo_lifecycle", "idempotency_key": key})
    job.raise_for_status()
    job_id = job.json()["id"]

    for status in ("running", "succeeded"):
        adv = c.post(f"/api/jobs/{job_id}/advance", headers=h, json={"to_status": status})
        adv.raise_for_status()

    denied = c.get("/api/jobs")
    assert denied.status_code == 401

    final = c.get(f"/api/jobs/{job_id}", headers=h).json()
    assert final["status"] == "succeeded"
    print(
        "phase1-gate-ok",
        me.json()["email"],
        "job",
        final["status"],
        "site",
        site.json()["normalized_domain"],
    )
