"""Offline parse checks for portfolio-style HTML (ramzan.dev-like)."""

from app.services.site_profile import _extract_page, _parse_title_identity

name, niche = _parse_title_identity(
    "Muhammad Ramzan — Full-Stack Software Engineer & Flutter Developer"
)
assert name == "Muhammad Ramzan"
assert "Flutter" in (niche or "")
assert niche != name

html = """
<html><head>
<title>Muhammad Ramzan — Full-Stack Software Engineer & Flutter Developer</title>
<meta name="description" content="Flutter developer & software engineer shipping production mobile apps, SaaS platforms, and backends." />
<meta property="og:title" content="Muhammad Ramzan — Full-Stack Software Engineer & Flutter Developer" />
</head><body>
<header><nav>Home About Stack Work Experience Blog Contact Hire me</nav></header>
<main id="main-content">
<p class="role">Software Engineer · Flutter · Available worldwide</p>
<h1>Muhammad Ramzan</h1>
<p>From multi-app SaaS platforms to App Store releases, I own delivery end to end.</p>
<section>
<h2>End-to-end ownership</h2>
<p>I build complete systems in Flutter and Dart, with Node.js, Python, and JS backends and tooling, plus the admin surfaces that keep operations moving.</p>
</section>
<section>
<h2>Services</h2>
<ul>
<li>Flutter Development</li>
<li>SaaS Platforms</li>
<li>Backend &amp; APIs</li>
<li>AI-Integrated Apps</li>
<li>Next.js Web</li>
<li>App Store Shipping</li>
</ul>
</section>
<section>
<h2>Projects that make an impact</h2>
<p>Production work across mobile, SaaS, and web.</p>
</section>
</main>
<footer>
<h3>Services</h3>
<ul>
<li>Flutter Development</li>
<li>SaaS Platforms</li>
</ul>
</footer>
</body></html>
"""

page = _extract_page(html, "https://ramzan.dev/")
assert page["h1"][0] == "Muhammad Ramzan"
assert any("Flutter" in r for r in page["role_candidates"]) or page["meta_description"]
assert "Flutter Development" in page["services"]
assert "Projects that make an impact" not in page["services"]
print("site-profile-parse-ok", page["services"][:3], page["meta_description"][:40])
