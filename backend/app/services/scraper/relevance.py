"""Strict niche relevance — keep only places that match the searched business type."""

from __future__ import annotations

import re

_STOP = {
    "in",
    "the",
    "a",
    "an",
    "and",
    "or",
    "of",
    "for",
    "near",
    "at",
    "to",
    "with",
    "by",
    "on",
    "shop",
    "store",
    "center",
    "centre",
    "service",
    "services",
    "company",
    "ltd",
    "llc",
    "pvt",
    "private",
    "limited",
}

_GYM = frozenset(
    {
        "gym",
        "gyms",
        "fitness",
        "fitness center",
        "fitness centre",
        "fitness club",
        "health club",
        "sports club",
        "athletic club",
        "workout",
        "crossfit",
        "personal trainer",
        "gymnasium",
        "training center",
        "training centre",
    }
)

_DENTIST = frozenset(
    {"dentist", "dental", "dental clinic", "dental office", "orthodontist", "teeth"}
)
_RESTAURANT = frozenset(
    {"restaurant", "restaurants", "eatery", "dining", "cafe", "café", "fast food", "food court"}
)
_REAL_ESTATE = frozenset(
    {
        "real estate",
        "real estate agency",
        "real estate agent",
        "realtor",
        "property dealer",
        "estate agent",
        "estate agency",
        "housing",
        "housing society",
        "housing complex",
    }
)
_HOTEL = frozenset({"hotel", "hotels", "motel", "guest house", "hostel", "lodging"})
_SALON = frozenset({"salon", "hair salon", "beauty salon", "barber", "barbershop", "spa"})
_LAWYER = frozenset({"lawyer", "attorney", "law firm", "advocate", "legal"})
_PHARMACY = frozenset({"pharmacy", "chemist", "drugstore", "medical store"})
_SCHOOL = frozenset({"school", "academy", "college", "university", "tuition", "coaching"})
_CLINIC = frozenset({"clinic", "hospital", "medical clinic", "doctor", "physician"})
_CAFE = frozenset({"cafe", "café", "coffee", "coffee shop"})
_BAKERY = frozenset({"bakery", "bakeries", "cake shop"})

_CLUSTERS: tuple[frozenset[str], ...] = (
    _GYM,
    _DENTIST,
    _RESTAURANT,
    _REAL_ESTATE,
    _HOTEL,
    _SALON,
    _LAWYER,
    _PHARMACY,
    _SCHOOL,
    _CLINIC,
    _CAFE,
    _BAKERY,
)

# Extra reject patterns when searching a niche (name or category).
_FOREIGN_BY_CLUSTER: dict[frozenset[str], re.Pattern[str]] = {
    _GYM: re.compile(
        r"\b("
        r"beauty|beauti|salon|saloon|barber|spa|boutique|parlour|parlor|"
        r"housing|society|real\s*estate|property\s*dealer|apartment|plot|"
        r"restaurant|cafe|caf[eé]|hotel|motel|pharmacy|chemist|"
        r"dentist|dental|school|college|clinic|hospital|lawyer|attorney|"
        r"electronics|mobile\s*repair|support\s*shop|shopping\s*mall|"
        r"supermarket|grocery|market|mart|mosque|masjid|bank|insurance|"
        r"tailor|laundry|workshop|warehouse|factory|association|ngo|"
        r"government|park|petrol|fuel|car\s*wash|auto\s*parts|hardware|"
        r"furniture|clothing|boutique|jeweller|jewelry|optician|"
        r"travel\s*agency|courier|internet\s*cafe"
        r")\b"
    ),
}


def _norm(text: str) -> str:
    s = (text or "").lower().strip()
    s = s.replace("real state", "real estate").replace("realstate", "real estate")
    s = s.replace("beauti", "beauty").replace("saloon", "salon")
    s = re.sub(r"[^a-z0-9\s&/+]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _tokens(text: str) -> list[str]:
    return [t for t in _norm(text).split() if t and t not in _STOP and len(t) >= 2]


def _contains_term(hay: str, term: str) -> bool:
    term = _norm(term)
    if not term or not hay:
        return False
    if " " in term:
        return term in hay
    return bool(re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", hay))


def _matched_cluster(business_type: str) -> frozenset[str] | None:
    q = _norm(business_type)
    toks = set(_tokens(q))
    for cluster in _CLUSTERS:
        if q in cluster or any(t in cluster for t in toks | {q}):
            return cluster
    return None


def _cluster_for_text(text: str) -> frozenset[str] | None:
    """Which niche cluster best describes this Maps category / name snippet."""
    hay = _norm(text)
    if not hay:
        return None
    best: frozenset[str] | None = None
    best_score = 0
    for cluster in _CLUSTERS:
        score = 0
        for term in cluster:
            if _contains_term(hay, term):
                score = max(score, len(term.split()))
        if score > best_score:
            best_score = score
            best = cluster
    return best if best_score > 0 else None


def expand_query_terms(business_type: str) -> set[str]:
    q = _norm(business_type)
    terms: set[str] = set()
    if not q:
        return terms
    terms.add(q)
    for tok in _tokens(q):
        terms.add(tok)
    cluster = _matched_cluster(business_type)
    if cluster:
        terms |= set(cluster)
    return {t for t in terms if t}


def is_relevant_place(
    business_type: str,
    *,
    business_name: str | None = None,
    maps_category: str | None = None,
) -> bool:
    """True only when name and/or Maps category clearly match the searched niche."""
    terms = expand_query_terms(business_type)
    if not terms:
        return True

    name = _norm(business_name or "")
    cat = _norm(maps_category or "")
    if not name and not cat:
        return False

    name_hit = any(_contains_term(name, t) for t in terms)
    cat_hit = any(_contains_term(cat, t) for t in terms)
    query_cluster = _matched_cluster(business_type)

    # Category belongs to a different known niche → reject (unless name clearly matches ours).
    if cat:
        cat_cluster = _cluster_for_text(cat)
        if (
            query_cluster
            and cat_cluster
            and cat_cluster is not query_cluster
            and not name_hit
        ):
            return False

    foreign_re = _FOREIGN_BY_CLUSTER.get(query_cluster) if query_cluster else None
    name_foreign = bool(foreign_re and name and foreign_re.search(name))
    cat_foreign = bool(foreign_re and cat and foreign_re.search(cat))

    # Wrong Maps chip "Gym" on a salon / housing name → reject.
    if name_foreign and not name_hit:
        return False
    if cat_foreign and not name_hit:
        return False

    # Strict: do not trust category alone when name has zero niche words —
    # except when category is a known niche phrase AND name isn't foreign.
    # "Iron Paradise" + category Gym → keep via cat_hit (name not foreign).
    if cat_hit and not name_hit:
        # Reject bare/generic category bleed if category equals only the query word
        # and name looks empty of niche — still allow known multi-word gym categories.
        if query_cluster and cat in query_cluster:
            return True
        if any(_contains_term(cat, t) for t in query_cluster or set()):
            return True
        return False

    if name_hit or cat_hit:
        return True
    return False
