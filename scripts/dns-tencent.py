#!/usr/bin/env python3
"""dns-tencent.py — 用腾讯云 API(DNSPod)为 1kni4r.top 配置 GitHub Pages 的 DNS 记录。

腾讯云 API 版本:DNSPod 2021-03-23,TC3-HMAC-SHA256 签名(标准库实现,无第三方依赖)。

用法:
  export TENCENTCLOUD_SECRET_ID=AKIDxxx
  export TENCENTCLOUD_SECRET_KEY=xxx
  python3 scripts/dns-tencent.py            # 配置
  python3 scripts/dns-tencent.py --dry-run  # 只打印将要创建的记录
  python3 scripts/dns-tencent.py --check    # 只查询当前记录

动作:
  1. 查询域名 1kni4r.top 现有记录;
  2. 删除已存在但不在目标清单里的 @ 主机 A/AAAA 记录;
  3. 创建缺失的 A/AAAA 记录;
  4. 打印最终记录列表。

说明:DNSPod 免费套餐对同一子域名的"负载均衡"数量有限,默认线路只能放 2 条 A/AAAA,
因此 4 条 GitHub Pages 官方 IP 采用「默认 2 条 + 电信 1 条 + 联通 1 条」的方式覆盖,
每条线路各自只有 1~2 条记录,既满足免费套餐限制,又保留官方 4 个 IP 的冗余。
"""
import hashlib
import hmac
import json
import os
import sys
import time
import urllib.request

DOMAIN = "1kni4r.top"
HOST = "@"
REGION = ""
SERVICE = "dnspod"
ENDPOINT = "dnspod.tencentcloudapi.com"
VERSION = "2021-03-23"

# GitHub Pages 官方 IP(https://docs.github.com/pages/configuring-a-custom-domain-for-a-github-pages-site)
# (记录类型, 记录值, 线路) —— 线路分配见文件头说明
RECORDS = [
    ("A", "185.199.108.153", "默认"),
    ("A", "185.199.109.153", "默认"),
    ("A", "185.199.110.153", "电信"),
    ("A", "185.199.111.153", "联通"),
    ("AAAA", "2606:50c0:8000::153", "默认"),
    ("AAAA", "2606:50c0:8001::153", "默认"),
    ("AAAA", "2606:50c0:8002::153", "电信"),
    ("AAAA", "2606:50c0:8003::153", "联通"),
]

SECRET_ID = os.environ.get("TENCENTCLOUD_SECRET_ID", "")
SECRET_KEY = os.environ.get("TENCENTCLOUD_SECRET_KEY", "")


def _hmac(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def call(action: str, payload: dict) -> dict:
    """调用腾讯云 API,返回解析后的 JSON。"""
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    timestamp = int(time.time())
    date = time.strftime("%Y-%m-%d", time.gmtime(timestamp))
    canonical_request = "\n".join(
        [
            "POST",
            "/",
            "",
            "content-type:application/json; charset=utf-8\n" + f"host:{ENDPOINT}\n",
            "content-type;host",
            hashlib.sha256(body.encode("utf-8")).hexdigest(),
        ]
    )
    hashed_request = hashlib.sha256(canonical_request.encode("utf-8")).hexdigest()
    credential_scope = f"{date}/{SERVICE}/tc3_request"
    string_to_sign = "\n".join(
        ["TC3-HMAC-SHA256", str(timestamp), credential_scope, hashed_request]
    )
    secret_date = _hmac(("TC3" + SECRET_KEY).encode("utf-8"), date)
    secret_service = _hmac(secret_date, SERVICE)
    secret_signing = _hmac(secret_service, "tc3_request")
    signature = hmac.new(
        secret_signing, string_to_sign.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    authorization = (
        f"TC3-HMAC-SHA256 Credential={SECRET_ID}/{credential_scope}, "
        f"SignedHeaders=content-type;host, Signature={signature}"
    )
    req = urllib.request.Request(
        f"https://{ENDPOINT}",
        data=body.encode("utf-8"),
        headers={
            "Authorization": authorization,
            "Content-Type": "application/json; charset=utf-8",
            "Host": ENDPOINT,
            "X-TC-Action": action,
            "X-TC-Timestamp": str(timestamp),
            "X-TC-Version": VERSION,
            "X-TC-Region": REGION,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    if "Response" not in data:
        raise RuntimeError(f"异常响应: {data}")
    r = data["Response"]
    if "Error" in r:
        raise RuntimeError(f"{action} 失败: {r['Error'].get('Code')} {r['Error'].get('Message')}")
    return r


def list_records() -> list:
    r = call("DescribeRecordList", {"Domain": DOMAIN, "Limit": 200})
    return r.get("RecordList", [])


def main() -> int:
    if not SECRET_ID or not SECRET_KEY:
        print("缺少环境变量 TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY", file=sys.stderr)
        return 1
    dry = "--dry-run" in sys.argv
    check = "--check" in sys.argv

    records = list_records()
    print(f"当前 {DOMAIN} 记录数: {len(records)}")
    for rec in records:
        print(
            f"  {rec.get('Name'):<10} {rec.get('Type'):<6} {rec.get('Value'):<45} "
            f"线路={rec.get('Line') or rec.get('RecordLine') or '-'} TTL={rec.get('TTL')} id={rec.get('RecordId')}"
        )
    if check:
        return 0

    desired = set(RECORDS)
    # 只清理主机记录为 @ 的 A/AAAA(不碰 MX/TXT/子域名记录),且 (类型,值,线路) 不在目标清单里
    stale = [
        rec
        for rec in records
        if rec.get("Name") == HOST
        and rec.get("Type") in ("A", "AAAA")
        and (rec.get("Type"), rec.get("Value"), rec.get("Line") or rec.get("RecordLine")) not in desired
    ]
    existing = {
        (rec.get("Type"), rec.get("Value"), rec.get("Line") or rec.get("RecordLine"))
        for rec in records
        if rec.get("Name") == HOST
    }
    to_create = [d for d in RECORDS if d not in existing]

    print("\n计划:")
    for rec in stale:
        print(f"  删除 {rec.get('Type')} {rec.get('Value')} 线路={rec.get('Line')} (id={rec.get('RecordId')})")
    for typ, val, line in to_create:
        print(f"  创建 {typ} {val} 线路={line}")
    if not stale and not to_create:
        print("  无需变更,记录已就绪")
        return 0
    if dry:
        print("\n(dry-run,未执行)")
        return 0

    for rec in stale:
        call("DeleteRecord", {"Domain": DOMAIN, "RecordId": rec["RecordId"]})
        print(f"已删除 {rec.get('Type')} {rec.get('Value')} 线路={rec.get('Line')}")
    for typ, val, line in to_create:
        call(
            "CreateRecord",
            {
                "Domain": DOMAIN,
                "SubDomain": HOST,
                "RecordType": typ,
                "RecordLine": line,
                "Value": val,
                "TTL": 600,
            },
        )
        print(f"已创建 {typ} {val} 线路={line}")

    print("\n最终记录:")
    for rec in list_records():
        print(
            f"  {rec.get('Name'):<10} {rec.get('Type'):<6} {rec.get('Value'):<45} "
            f"线路={rec.get('Line') or rec.get('RecordLine') or '-'} TTL={rec.get('TTL')}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
