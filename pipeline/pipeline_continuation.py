"""
Pipeline Continuation: Steps 4–8 for UF Scholars Data Pipeline
================================================================
This script picks up where UF_profs.ipynb left off (after Step 3).
The first 3 cells of the notebook handle:
  1. Fetching all scholars from the UF API with pagination
  2. Enriching the CSV with emails
  3. Enriching the CSV with publications and grants JSON

This script handles:
  Step 4 — CSV → JSON conversion
  Step 5 — Parse & truncate publications/grants (max 10 each)
  Step 6 — Gemma-3 AI enrichment via Google Gemini API (one entry at a time)
  Step 7 — Final schema assembly
  Step 8 — MongoDB upload + static fallback copy

Usage:
  python pipeline_continuation.py                  # Run all steps
  python pipeline_continuation.py --step 6         # Run from step 6 onward
  python pipeline_continuation.py --step 6 --only  # Run only step 6
"""

import csv
import json
import os
import sys
import time
import shutil
import argparse
from datetime import datetime

# ═══════════════════════════════════════════════════════════════════
# Configuration
# ═══════════════════════════════════════════════════════════════════

# Input from notebook's Step 3
INPUT_CSV = "ufl_scholars_data_complete.csv"

# Intermediate outputs
INTERMEDIATE_JSON = "scholars_raw.json"
PARSED_JSON = "scholars_parsed.json"
ENRICHED_JSON = "scholars_enriched.json"
FINAL_JSON = "scholars_final.json"

# Truncation limits
MAX_PUBLICATIONS = 10
MAX_GRANTS = 10

# ── Google Gemini API Settings ──
# Get your API key from https://aistudio.google.com/apikey
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")
GEMINI_MODEL = "gemma-3-27b-it"
GEMINI_API_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
)

BATCH_SIZE = 5          # Save checkpoint every N scholars
REQUEST_DELAY = 4       # Seconds between API calls (Gemini free tier: 15 RPM)
MAX_RETRIES = 3         # Retries per scholar on API failure
CHECKPOINT_FILE = "enrichment_checkpoint.json"

# MongoDB
MONGODB_DB = "ufl_scholars_db"
MONGODB_COLLECTION = "scholars"

# Project root (one level up from pipeline/)
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


# ═══════════════════════════════════════════════════════════════════
# Step 4: CSV → JSON Conversion
# ═══════════════════════════════════════════════════════════════════

def step4_csv_to_json():
    """Convert the enriched CSV into a JSON file.

    Parses the publications_json and grants_json columns from raw JSON strings
    back into Python objects.
    """
    print("\n" + "=" * 60)
    print("Step 4: CSV → JSON Conversion")
    print("=" * 60)

    if not os.path.exists(INPUT_CSV):
        print(f"Error: '{INPUT_CSV}' not found in {os.getcwd()}")
        sys.exit(1)

    scholars = []

    with open(INPUT_CSV, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            scholar = dict(row)

            # Parse JSON string columns back into dicts/lists
            for json_col in ["publications_json", "grants_json"]:
                raw = scholar.get(json_col, "{}")
                try:
                    scholar[json_col] = json.loads(raw) if raw else {}
                except json.JSONDecodeError:
                    print(
                        f"  Warning: Could not parse {json_col} for "
                        f"{scholar.get('discoveryUrlId', '?')}"
                    )
                    scholar[json_col] = {}

            scholars.append(scholar)

    with open(INTERMEDIATE_JSON, "w", encoding="utf-8") as f:
        json.dump(scholars, f, indent=2, ensure_ascii=False)

    print(f"✓ Converted {len(scholars)} scholars from CSV → JSON")
    print(f"  Saved to: {INTERMEDIATE_JSON}")
    print(f"  Sample keys: {list(scholars[0].keys()) if scholars else 'N/A'}")
    return scholars


# ═══════════════════════════════════════════════════════════════════
# Step 5: Parse & Truncate Publications / Grants
# ═══════════════════════════════════════════════════════════════════

def _parse_publications(pub_data, max_count=MAX_PUBLICATIONS):
    """Extract structured publication info from the raw API response.

    Expected API shape: { "resource": [ { "name": ..., "abstract": ..., "publicationDate": ... } ] }
    Returns list of { title, abstract, date } dicts, sorted by date descending.
    """
    if not pub_data or not isinstance(pub_data, dict):
        return []

    resources = pub_data.get("resource", [])
    if not isinstance(resources, list):
        return []

    publications = []
    for pub in resources:
        if not isinstance(pub, dict):
            continue

        title = pub.get("name", "").strip()
        if not title:
            continue

        abstract = pub.get("abstract", "") or ""
        abstract = " ".join(abstract.split()).strip()  # collapse whitespace

        # Parse date — API returns ISO format or nested dict
        pub_date = pub.get("publicationDate", "") or ""
        if isinstance(pub_date, dict):
            pub_date = str(pub_date.get("year", ""))

        publications.append(
            {"title": title, "abstract": abstract, "date": pub_date}
        )

    publications.sort(key=lambda x: x.get("date", ""), reverse=True)
    return publications[:max_count]


def _parse_grants(grant_data, max_count=MAX_GRANTS):
    """Extract structured grant info from the raw API response.

    Expected API shape: { "resource": [ { "name": ..., "funderName": ..., ... } ] }
    Returns (active_grants, expired_grants) tuple of lists.
    """
    if not grant_data or not isinstance(grant_data, dict):
        return [], []

    resources = grant_data.get("resource", [])
    if not isinstance(resources, list):
        return [], []

    active_grants = []
    expired_grants = []

    for grant in resources:
        if not isinstance(grant, dict):
            continue

        title = grant.get("name", "").strip()
        if not title:
            continue

        funder_name = grant.get("funderName", "") or ""
        start_date = grant.get("startDate", "") or ""
        end_date = grant.get("endDate", "") or ""
        duration = f"{start_date} to {end_date}" if start_date and end_date else ""

        # Determine active vs expired
        status = "Active"
        if end_date:
            try:
                end_dt = datetime.strptime(end_date[:10], "%Y-%m-%d")
                if end_dt < datetime.now():
                    status = "Expired"
            except ValueError:
                pass

        entry = {
            "title": title,
            "funder_name": funder_name,
            "duration": duration,
            "status": status,
        }

        if status == "Active":
            active_grants.append(entry)
        else:
            expired_grants.append(entry)

    return active_grants[:max_count], expired_grants[:max_count]


def step5_parse_and_truncate():
    """Parse and truncate publications/grants for all scholars."""
    print("\n" + "=" * 60)
    print("Step 5: Parse & Truncate Publications/Grants")
    print("=" * 60)

    with open(INTERMEDIATE_JSON, "r", encoding="utf-8") as f:
        scholars = json.load(f)

    for i, scholar in enumerate(scholars):
        scholar["publications"] = _parse_publications(
            scholar.get("publications_json", {})
        )
        active, expired = _parse_grants(scholar.get("grants_json", {}))
        scholar["active_grants"] = active
        scholar["expired_grants"] = expired
        scholar["active_grants_count"] = len(active)

        # Remove raw JSON columns
        scholar.pop("publications_json", None)
        scholar.pop("grants_json", None)

        if (i + 1) % 500 == 0:
            print(f"  Processed {i + 1}/{len(scholars)} scholars...")

    with open(PARSED_JSON, "w", encoding="utf-8") as f:
        json.dump(scholars, f, indent=2, ensure_ascii=False)

    total_pubs = sum(len(s.get("publications", [])) for s in scholars)
    total_active = sum(len(s.get("active_grants", [])) for s in scholars)
    total_expired = sum(len(s.get("expired_grants", [])) for s in scholars)

    print(f"✓ Parsed & truncated {len(scholars)} scholars")
    print(f"  Max {MAX_PUBLICATIONS} publications, {MAX_GRANTS} grants each")
    print(f"  Totals: {total_pubs} pubs, {total_active} active grants, {total_expired} expired grants")
    print(f"  Saved to: {PARSED_JSON}")
    return scholars


# ═══════════════════════════════════════════════════════════════════
# Step 6: Gemma-3 AI Enrichment via Google Gemini API
# ═══════════════════════════════════════════════════════════════════

def _build_prompt(scholar):
    """Build the prompt for Gemma-3 to analyze a scholar's CS relevance."""

    # Summarize publications (title + first 200 chars of abstract)
    pub_lines = []
    for p in scholar.get("publications", []):
        line = f"- {p['title']}"
        if p.get("abstract"):
            line += f" | Abstract: {p['abstract'][:200]}..."
        pub_lines.append(line)
    pub_text = "\n".join(pub_lines) if pub_lines else "None"

    # Summarize grants
    grant_lines = []
    for g in scholar.get("active_grants", []) + scholar.get("expired_grants", []):
        line = f"- {g['title']} (Funder: {g.get('funder_name', 'N/A')}, Status: {g.get('status', 'N/A')})"
        grant_lines.append(line)
    grant_text = "\n".join(grant_lines) if grant_lines else "None"

    tags = scholar.get("tags", [])
    tags_text = ", ".join(tags) if tags else "None"

    return f"""You are an expert academic advisor analyzing a university professor's research profile to determine their relevance to Computer Science (CS) collaboration.

Professor Profile:
- Name: {scholar.get("name", "Unknown")}
- Department: {scholar.get("department", "Unknown")}
- Position: {scholar.get("position", "Unknown")}
- Research Tags: {tags_text}

Recent Publications (up to 10):
{pub_text}

Grants (active and expired):
{grant_text}

Based on this profile, provide a JSON response with EXACTLY these fields:

1. "relevance_score": integer 0-100. How relevant is this professor's research to CS?
   - 0-20: No CS relevance
   - 21-40: Minimal — could use basic data analysis
   - 41-60: Moderate — uses computational methods, could benefit from CS collaboration
   - 61-80: High — actively uses ML/AI/data science/software in research
   - 81-100: Core CS — research IS computer science

2. "reasoning": array of 3 strings explaining your score. Be specific about which publications/grants informed your assessment.

3. "requirements": array of 3-5 strings listing possible CS role requirements (e.g., "Machine Learning", "Full Stack Development", "Data Visualization", "NLP", "Computer Vision").

4. "should_email": "Yes" if relevance_score >= 50, "No" otherwise.

5. "tags": array of research area tags (e.g., ["Machine Learning", "Bioinformatics"]). Use the existing tags if available, otherwise infer from publications.

Respond with ONLY valid JSON, no markdown fences, no explanation."""


def _call_gemini(prompt, retries=MAX_RETRIES):
    """Call Gemma-3-27B-IT via Google Gemini API (one entry at a time).

    Uses the REST API:
    POST https://generativelanguage.googleapis.com/v1beta/models/gemma-3-27b-it:generateContent?key=API_KEY
    """
    import requests

    if not GOOGLE_API_KEY:
        print("  ⚠ GOOGLE_API_KEY not set! Set via: export GOOGLE_API_KEY='your-key'")
        return {
            "relevance_score": 0,
            "reasoning": ["GOOGLE_API_KEY not configured."],
            "requirements": [],
            "should_email": "No",
            "tags": [],
        }

    url = f"{GEMINI_API_URL}?key={GOOGLE_API_KEY}"

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt}
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 800,
            "responseMimeType": "application/json",
        },
    }

    headers = {"Content-Type": "application/json"}

    for attempt in range(retries):
        try:
            response = requests.post(
                url,
                json=payload,
                headers=headers,
                timeout=120,
            )

            # Handle rate limiting (429)
            if response.status_code == 429:
                wait_time = REQUEST_DELAY * (attempt + 2)
                print(f"    Rate limited. Waiting {wait_time}s...")
                time.sleep(wait_time)
                continue

            response.raise_for_status()
            data = response.json()

            # Extract text from Gemini API response
            content = data["candidates"][0]["content"]["parts"][0]["text"]

            # Strip markdown fences if present (safety net)
            content = content.strip()
            if content.startswith("```"):
                content = content.split("\n", 1)[1]
                content = content.rsplit("```", 1)[0]
            content = content.strip()

            return json.loads(content)

        except requests.exceptions.HTTPError as e:
            print(f"    Attempt {attempt + 1}/{retries} HTTP error: {e}")
            if attempt < retries - 1:
                time.sleep(REQUEST_DELAY * (attempt + 1))
        except (json.JSONDecodeError, KeyError, IndexError) as e:
            print(f"    Attempt {attempt + 1}/{retries} parse error: {e}")
            if attempt < retries - 1:
                time.sleep(REQUEST_DELAY)
        except requests.exceptions.RequestException as e:
            print(f"    Attempt {attempt + 1}/{retries} network error: {e}")
            if attempt < retries - 1:
                time.sleep(REQUEST_DELAY * (attempt + 1))

    # Defaults on failure
    return {
        "relevance_score": 0,
        "reasoning": ["AI enrichment failed after all retries."],
        "requirements": [],
        "should_email": "No",
        "tags": [],
    }


def _validate_ai_response(result):
    """Validate and sanitize the AI response to match the expected schema."""
    v = {}

    score = result.get("relevance_score", 0)
    try:
        v["relevance_score"] = max(0, min(100, int(score)))
    except (ValueError, TypeError):
        v["relevance_score"] = 0

    reasoning = result.get("reasoning", [])
    if isinstance(reasoning, str):
        reasoning = [reasoning]
    v["reasoning"] = [str(r) for r in reasoning if r]

    requirements = result.get("requirements", [])
    if isinstance(requirements, str):
        requirements = [requirements]
    v["requirements"] = [str(r) for r in requirements if r]

    should = result.get("should_email", "No")
    v["should_email"] = (
        "Yes" if str(should).lower() in ["yes", "true", "1"] else "No"
    )

    tags = result.get("tags", [])
    if isinstance(tags, str):
        tags = [tags]
    v["tags"] = [str(t) for t in tags if t]

    return v


def step6_gemma_enrichment():
    """Run Gemma-3 AI enrichment via Google Gemini API — one scholar at a time.

    Features:
    - Checkpoint/resume: saves progress every BATCH_SIZE scholars
    - Rate limiting: waits REQUEST_DELAY seconds between API calls
    - Retry logic: retries MAX_RETRIES times on failure with backoff
    """
    print("\n" + "=" * 60)
    print("Step 6: Gemma-3 AI Enrichment (Google Gemini API)")
    print("=" * 60)

    if not GOOGLE_API_KEY:
        print("ERROR: GOOGLE_API_KEY environment variable is not set.")
        print("  Get your key from: https://aistudio.google.com/apikey")
        print("  Then run: export GOOGLE_API_KEY='your-key-here'")
        sys.exit(1)

    print(f"  Model: {GEMINI_MODEL}")
    print(f"  Endpoint: {GEMINI_API_URL}")
    print(f"  Rate limit delay: {REQUEST_DELAY}s between calls")

    with open(PARSED_JSON, "r", encoding="utf-8") as f:
        scholars = json.load(f)

    # Load checkpoint
    checkpoint = {}
    if os.path.exists(CHECKPOINT_FILE):
        with open(CHECKPOINT_FILE, "r") as f:
            checkpoint = json.load(f)
    print(f"  Checkpoint: {len(checkpoint)} already-enriched scholars\n")

    enriched = []
    skipped = 0
    processed = 0

    for i, scholar in enumerate(scholars):
        scholar_id = scholar.get("discoveryUrlId", scholar.get("id", f"unknown_{i}"))

        # Resume from checkpoint
        if scholar_id in checkpoint:
            scholar.update(checkpoint[scholar_id])
            enriched.append(scholar)
            skipped += 1
            continue

        prompt = _build_prompt(scholar)
        name = scholar.get("name", scholar_id)
        print(f"[{i + 1}/{len(scholars)}] {name}...", end=" ", flush=True)

        raw_result = _call_gemini(prompt)
        ai_data = _validate_ai_response(raw_result)

        scholar.update(ai_data)
        enriched.append(scholar)

        checkpoint[scholar_id] = ai_data
        processed += 1

        score = ai_data.get("relevance_score", 0)
        email = ai_data.get("should_email", "No")
        print(f"score={score}, email={email}")

        # Batch checkpoint save
        if processed % BATCH_SIZE == 0:
            with open(CHECKPOINT_FILE, "w") as f:
                json.dump(checkpoint, f, indent=2, ensure_ascii=False)
            print(f"  💾 Checkpoint saved ({processed} new, {skipped} resumed)")

        # Rate limiting — respect Gemini API quotas
        time.sleep(REQUEST_DELAY)

    # Final checkpoint save
    with open(CHECKPOINT_FILE, "w") as f:
        json.dump(checkpoint, f, indent=2, ensure_ascii=False)

    with open(ENRICHED_JSON, "w", encoding="utf-8") as f:
        json.dump(enriched, f, indent=2, ensure_ascii=False)

    print(f"\n✓ Enrichment complete!")
    print(f"  Total: {len(enriched)} | New: {processed} | Resumed: {skipped}")
    print(f"  Saved to: {ENRICHED_JSON}")

    # Score distribution
    scores = [s.get("relevance_score", 0) for s in enriched]
    if scores:
        print(f"\nScore distribution:")
        for lo, hi, label in [
            (0, 20, "No relevance"),
            (21, 40, "Minimal"),
            (41, 60, "Moderate"),
            (61, 80, "High"),
            (81, 100, "Core CS"),
        ]:
            count = sum(1 for s in scores if lo <= s <= hi)
            bar = "█" * count
            print(f"  {lo:>3}-{hi:<3} {label:<15} {count:>4} {bar}")

    return enriched


# ═══════════════════════════════════════════════════════════════════
# Step 7: Final Schema Assembly
# ═══════════════════════════════════════════════════════════════════

def _build_name(scholar):
    """Build display name from available name fields."""
    if scholar.get("name"):
        return scholar["name"]
    first = scholar.get("firstName", "") or ""
    last = scholar.get("lastName", "") or ""
    return f"{first} {last}".strip() or scholar.get("discoveryUrlId", "Unknown")


def step7_final_assembly():
    """Map enriched scholars to the exact schema expected by the web app.

    Final document shape (per the MongoDB collection):
    {
      id, name, title, email, department, position,
      should_email, relevance_score, tags, reasoning, requirements,
      active_grants, expired_grants, active_grants_count, publications
    }
    """
    print("\n" + "=" * 60)
    print("Step 7: Final Schema Assembly")
    print("=" * 60)

    with open(ENRICHED_JSON, "r", encoding="utf-8") as f:
        scholars = json.load(f)

    final = []
    for scholar in scholars:
        doc = {
            # Core identity
            "id": scholar.get("discoveryUrlId", ""),
            "name": _build_name(scholar),
            "title": scholar.get("title", ""),
            "email": scholar.get("email", ""),
            "department": scholar.get("department", ""),
            "position": scholar.get("position", ""),
            # AI-generated fields
            "should_email": scholar.get("should_email", "No"),
            "relevance_score": scholar.get("relevance_score", 0),
            "tags": scholar.get("tags", []),
            "reasoning": scholar.get("reasoning", []),
            "requirements": scholar.get("requirements", []),
            # Grants
            "active_grants": scholar.get("active_grants", []),
            "expired_grants": scholar.get("expired_grants", []),
            "active_grants_count": scholar.get("active_grants_count", 0),
            # Publications
            "publications": scholar.get("publications", []),
        }
        final.append(doc)

    # Sort by relevance descending
    final.sort(key=lambda x: x["relevance_score"], reverse=True)

    with open(FINAL_JSON, "w", encoding="utf-8") as f:
        json.dump(final, f, indent=2, ensure_ascii=False)

    # Validation
    missing_id = sum(1 for s in final if not s["id"])
    missing_email = sum(1 for s in final if not s["email"])
    high_rel = sum(1 for s in final if s["relevance_score"] >= 50)
    yes_email = sum(1 for s in final if s["should_email"] == "Yes")

    print(f"✓ Assembled {len(final)} scholars into final schema")
    print(f"  Saved to: {FINAL_JSON}")
    print(f"\nValidation:")
    print(f"  Missing IDs:    {missing_id}")
    print(f"  Missing emails: {missing_email}")
    print(f"  Score ≥ 50:     {high_rel}")
    print(f"  Should email:   {yes_email}")

    # Top 5
    print(f"\nTop 5 by relevance:")
    for s in final[:5]:
        print(
            f"  {s['relevance_score']:>3} | {s['name']:<30} | "
            f"{s['department']:<40} | {s['should_email']}"
        )

    return final


# ═══════════════════════════════════════════════════════════════════
# Step 8: Upload to MongoDB + Static Fallback
# ═══════════════════════════════════════════════════════════════════

def step8_upload():
    """Upload to MongoDB and copy to static data.json fallback."""
    print("\n" + "=" * 60)
    print("Step 8: Upload to MongoDB + Static Fallback")
    print("=" * 60)

    with open(FINAL_JSON, "r", encoding="utf-8") as f:
        scholars = json.load(f)

    # ── MongoDB upload ──
    mongodb_uri = os.environ.get("MONGODB_URI", "")
    if mongodb_uri:
        try:
            from pymongo import MongoClient

            print("Connecting to MongoDB...")
            client = MongoClient(mongodb_uri)
            db = client[MONGODB_DB]
            collection = db[MONGODB_COLLECTION]

            existing = collection.count_documents({})
            print(f"  Existing documents: {existing}")

            collection.delete_many({})
            print(f"  Cleared collection")

            result = collection.insert_many(scholars)
            print(f"  Inserted {len(result.inserted_ids)} documents")

            # Create indexes
            collection.create_index("id", unique=True)
            collection.create_index("relevance_score")
            collection.create_index("department")
            collection.create_index("position")
            collection.create_index("active_grants_count")
            print(
                f"  Indexes: id, relevance_score, department, position, active_grants_count"
            )

            final_count = collection.count_documents({})
            print(f"\n✓ MongoDB: {final_count} documents in {MONGODB_DB}.{MONGODB_COLLECTION}")
            client.close()

        except ImportError:
            print("⚠ pymongo not installed. Run: pip install pymongo")
        except Exception as e:
            print(f"⚠ MongoDB upload failed: {e}")
    else:
        print("⚠ MONGODB_URI not set — skipping MongoDB upload")
        print("  Set it via: export MONGODB_URI='mongodb+srv://...'")

    # ── Static fallback ──
    dest = os.path.join(PROJECT_ROOT, "src", "data.json")
    shutil.copy2(FINAL_JSON, dest)
    size_mb = os.path.getsize(dest) / (1024 * 1024)
    print(f"\n✓ Static fallback: {dest} ({size_mb:.1f} MB)")

    print(f"\n{'=' * 60}")
    print(f"🎉 Pipeline complete!")
    print(f"{'=' * 60}")


# ═══════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════

STEPS = {
    4: ("CSV → JSON", step4_csv_to_json),
    5: ("Parse & Truncate", step5_parse_and_truncate),
    6: ("Gemma-3 AI Enrichment (Gemini API)", step6_gemma_enrichment),
    7: ("Final Assembly", step7_final_assembly),
    8: ("MongoDB Upload", step8_upload),
}


def main():
    parser = argparse.ArgumentParser(description="UF Scholars Pipeline Continuation")
    parser.add_argument(
        "--step", type=int, default=4, choices=STEPS.keys(),
        help="Start from this step (default: 4)"
    )
    parser.add_argument(
        "--only", action="store_true",
        help="Run only the specified step"
    )
    args = parser.parse_args()

    print("UF Scholars Data Pipeline — Continuation Steps")
    print(f"Working directory: {os.getcwd()}")
    print(f"Project root: {PROJECT_ROOT}\n")

    if args.only:
        name, func = STEPS[args.step]
        print(f"Running only Step {args.step}: {name}")
        func()
    else:
        for step_num in sorted(STEPS.keys()):
            if step_num >= args.step:
                name, func = STEPS[step_num]
                func()


if __name__ == "__main__":
    main()
