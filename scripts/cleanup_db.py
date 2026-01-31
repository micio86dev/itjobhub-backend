from pymongo import MongoClient
import json


def run():
    client = MongoClient("mongodb://127.0.0.1:27017/itjobhub")
    db = client.itjobhub
    jobs = db.jobs

    # 1. Duplicates by link
    pipeline_link = [
        {"$group": {"_id": "$link", "count": {"$sum": 1}, "ids": {"$push": "$_id"}}},
        {"$match": {"count": {"$gt": 1}}},
    ]
    dups_link = list(jobs.aggregate(pipeline_link))

    del_dups = 0
    for d in dups_link:
        to_del = d["ids"][1:]
        res = jobs.delete_many({"_id": {"$in": to_del}})
        del_dups += res.deleted_count

    # 1.5 Duplicates by title and company_id
    pipeline_tc = [
        {
            "$group": {
                "_id": {"title": "$title", "company_id": "$company_id"},
                "count": {"$sum": 1},
                "ids": {"$push": "$_id"},
            }
        },
        {"$match": {"count": {"$gt": 1}}},
    ]
    dups_tc = list(jobs.aggregate(pipeline_tc))
    for d in dups_tc:
        to_del = d["ids"][1:]
        res = jobs.delete_many({"_id": {"$in": to_del}})
        del_dups += res.deleted_count

    # 2. Test jobs
    test_keywords = ["test", "batch", "import", "demo"]
    del_test = 0
    for kw in test_keywords:
        res = jobs.delete_many({"title": {"$regex": kw, "$options": "i"}})
        del_test += res.deleted_count

    print(f"Deleted {del_dups} duplicates and {del_test} test jobs.")


if __name__ == "__main__":
    run()
