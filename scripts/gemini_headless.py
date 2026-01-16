#!/usr/bin/env python3
"""
Gemini Headless - CLI wrapper for calling Gemini from Claude workflows.

Leverages the Gemini CLI subscription (no API key needed per call).
Designed for large context research tasks (2M+ tokens).

Usage:
  python3 scripts/gemini_headless.py --prompt "Your research query"
  python3 scripts/gemini_headless.py --prompt "Query" --output json
  python3 scripts/gemini_headless.py --prompt "Query" --think  # Deep thinking mode
  python3 scripts/gemini_headless.py --file research_prompt.txt
  cat prompt.txt | python3 scripts/gemini_headless.py --stdin

Options:
  --prompt    Direct text prompt
  --file      Read prompt from file
  --stdin     Read prompt from stdin
  --output    Output format: text (default), json, markdown
  --think     Enable deep thinking mode (adds reasoning scaffolding, longer timeout)
  --model     Model to use (default: CLI default - best available)
  --timeout   Timeout in seconds (default: 120, or 180 with --think)
  --verbose   Show debug information
"""

import argparse
import subprocess
import sys
import os
import json
import re
from datetime import datetime


# Default model for Gemini CLI
DEFAULT_MODEL = "gemini-3-pro-preview"


def get_gemini_command():
    """Return the command to run Gemini CLI."""
    # Try to find gemini in common locations
    nvm_gemini = os.path.expanduser("~/.nvm/versions/node/v22.21.1/bin/gemini")
    if os.path.exists(nvm_gemini):
        return [nvm_gemini]

    # Fallback to global gemini or npx
    result = subprocess.run(["which", "gemini"], capture_output=True, text=True)
    if result.returncode == 0:
        return [result.stdout.strip()]

    # Last resort: npx
    return ["npx", "gemini"]


THINKING_HIGH_PREAMBLE = """
<thinking_mode level="HIGH">
You are in DEEP THINKING MODE with HIGH reasoning depth. Before responding:
1. Pause and consider the full context thoroughly
2. Identify non-obvious implications, edge cases, and potential issues
3. Challenge your initial assumptions - what could be wrong?
4. Consider multiple perspectives (user, clinician, patient, designer, auditor)
5. Think through what could go wrong and how to prevent it
6. Reason step-by-step through complex decisions
7. Only then, provide your carefully considered analysis
</thinking_mode>

"""

THINKING_LOW_PREAMBLE = """
<thinking_mode level="LOW">
Quick response mode - be concise and direct. Focus on the key points only.
</thinking_mode>

"""

THINKING_SUFFIX = """

---
IMPORTANT: Apply the appropriate level of reasoning depth based on the thinking mode.
"""


def wrap_with_thinking(prompt: str, level: str = "high") -> str:
    """Wrap a prompt with thinking scaffolding at specified level."""
    if level.lower() == "low":
        return f"{THINKING_LOW_PREAMBLE}{prompt}"
    return f"{THINKING_HIGH_PREAMBLE}{prompt}{THINKING_SUFFIX}"


def call_gemini(prompt: str, timeout: int = 120, verbose: bool = False, model: str = None) -> dict:
    """
    Call the Gemini CLI with the given prompt.

    Returns:
        dict with keys: success, output, error, duration
    """
    start_time = datetime.now()

    # Use default model if not specified
    model = model or DEFAULT_MODEL

    if verbose:
        print(f"[DEBUG] Prompt length: {len(prompt)} chars", file=sys.stderr)
        print(f"[DEBUG] Model: {model}", file=sys.stderr)

    # Build command
    cmd = get_gemini_command()
    cmd.extend(["--model", model])

    try:
        # Pass prompt via stdin to avoid shell escaping issues
        result = subprocess.run(
            cmd,
            input=prompt,
            capture_output=True,
            text=True,
            timeout=timeout
        )

        duration = (datetime.now() - start_time).total_seconds()

        if result.returncode != 0:
            return {
                "success": False,
                "output": result.stdout,
                "error": result.stderr,
                "duration": duration
            }

        return {
            "success": True,
            "output": result.stdout.strip(),
            "error": "",
            "duration": duration
        }

    except subprocess.TimeoutExpired:
        duration = (datetime.now() - start_time).total_seconds()
        return {
            "success": False,
            "output": "",
            "error": f"Timeout after {timeout} seconds",
            "duration": duration
        }
    except Exception as e:
        duration = (datetime.now() - start_time).total_seconds()
        return {
            "success": False,
            "output": "",
            "error": str(e),
            "duration": duration
        }


def format_output(result: dict, output_format: str) -> str:
    """Format the result based on requested output format."""
    if output_format == "json":
        return json.dumps(result, indent=2)
    elif output_format == "markdown":
        if result["success"]:
            return f"## Gemini Response\n\n{result['output']}\n\n---\n*Duration: {result['duration']:.2f}s*"
        else:
            return f"## Error\n\n{result['error']}\n\n---\n*Duration: {result['duration']:.2f}s*"
    else:  # text
        if result["success"]:
            return result["output"]
        else:
            return f"ERROR: {result['error']}"


def extract_json_from_response(response: str) -> dict:
    """
    Attempt to extract JSON from a Gemini response.
    Useful when you've asked Gemini to respond in JSON format.
    """
    # Try to find JSON block
    json_match = re.search(r'```json\s*(.*?)\s*```', response, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group(1))
        except json.JSONDecodeError:
            pass

    # Try to parse the whole response as JSON
    try:
        return json.loads(response)
    except json.JSONDecodeError:
        pass

    # Return as text wrapped in dict
    return {"raw_text": response}


def main():
    parser = argparse.ArgumentParser(
        description="Gemini Headless - Call Gemini CLI from Claude workflows"
    )

    # Input options (mutually exclusive)
    input_group = parser.add_mutually_exclusive_group(required=True)
    input_group.add_argument("--prompt", "-p", help="Direct text prompt")
    input_group.add_argument("--file", "-f", help="Read prompt from file")
    input_group.add_argument("--stdin", "-s", action="store_true", help="Read prompt from stdin")

    # Output options
    parser.add_argument(
        "--output", "-o",
        choices=["text", "json", "markdown"],
        default="text",
        help="Output format (default: text)"
    )
    parser.add_argument(
        "--extract-json", "-j",
        action="store_true",
        help="Attempt to extract JSON from response"
    )

    # Thinking mode
    parser.add_argument(
        "--think", "-T",
        nargs="?",
        const="high",
        choices=["high", "low"],
        help="Enable thinking mode: high (deep reasoning) or low (quick response). Default: high"
    )

    # Other options
    parser.add_argument("--model", "-m", help="Model to use (default: CLI default - best available)")
    parser.add_argument("--timeout", "-t", type=int, default=None, help="Timeout in seconds (default: 120, or 180 with --think)")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")

    args = parser.parse_args()

    # Get prompt from source
    if args.prompt:
        prompt = args.prompt
    elif args.file:
        try:
            with open(args.file, 'r') as f:
                prompt = f.read()
        except FileNotFoundError:
            print(f"ERROR: File not found: {args.file}", file=sys.stderr)
            sys.exit(1)
    elif args.stdin:
        prompt = sys.stdin.read()

    if not prompt.strip():
        print("ERROR: Empty prompt", file=sys.stderr)
        sys.exit(1)

    # Configure thinking mode
    if args.think:
        think_level = args.think  # "high" or "low"
        prompt = wrap_with_thinking(prompt, level=think_level)
        model = args.model  # Use CLI default (best available model)
        timeout = args.timeout or (180 if think_level == "high" else 60)
        if args.verbose:
            print(f"[DEBUG] Thinking mode: {think_level}", file=sys.stderr)
    else:
        model = args.model
        timeout = args.timeout or 120

    if args.verbose:
        print(f"[DEBUG] Model: {model or 'default'}", file=sys.stderr)
        print(f"[DEBUG] Timeout: {timeout}s", file=sys.stderr)
        print(f"[DEBUG] Prompt length: {len(prompt)} chars", file=sys.stderr)

    # Call Gemini
    result = call_gemini(prompt, timeout=timeout, verbose=args.verbose, model=model)

    # Handle JSON extraction if requested
    if args.extract_json and result["success"]:
        extracted = extract_json_from_response(result["output"])
        result["extracted_json"] = extracted

    # Format and output
    output = format_output(result, args.output)
    print(output)

    # Exit with appropriate code
    sys.exit(0 if result["success"] else 1)


if __name__ == "__main__":
    main()
