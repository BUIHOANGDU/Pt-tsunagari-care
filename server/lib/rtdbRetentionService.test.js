const assert = require("assert");

const {
  getHistoryMaxRecords,
  pruneCollection,
} = require("./rtdbRetentionService");

function makeRecords(count, prefix = "key") {
  const records = {};
  for (let index = 0; index < count; index += 1) {
    const key = `${prefix}_${String(index).padStart(3, "0")}`;
    records[key] = {
      id: key,
      createdAtMs: 1000 + index,
    };
  }
  return records;
}

function makeSnapshot(value) {
  return {
    forEach(callback) {
      Object.entries(value || {}).forEach(([key, data]) => {
        callback({
          key,
          val: () => data,
        });
      });
    },
  };
}

function makeFakeDb(initialData, options = {}) {
  const data = JSON.parse(JSON.stringify(initialData || {}));
  return {
    data,
    ref(path = "") {
      return {
        async once() {
          if (options.failOnce) {
            options.failOnce = false;
            throw new Error("simulated firebase failure with no secrets");
          }
          return makeSnapshot(data[path] || {});
        },
        async update(updates) {
          Object.entries(updates || {}).forEach(([updatePath, value]) => {
            const [collection, key] = updatePath.split("/");
            if (!collection || !key) return;
            if (!data[collection]) data[collection] = {};
            if (value === null) {
              delete data[collection][key];
            } else {
              data[collection][key] = value;
            }
          });
        },
      };
    },
  };
}

async function assertPruneCount(count, expectedDeleted) {
  const db = makeFakeDb({
    health_concerns: makeRecords(count),
  });
  const result = await pruneCollection({
    db,
    path: "health_concerns",
    maxRecords: 30,
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.deletedCount, expectedDeleted);
  assert.strictEqual(Object.keys(db.data.health_concerns).length, 30);
  assert.ok(db.data.health_concerns.key_000 === undefined || expectedDeleted === 0);
}

async function run() {
  assert.strictEqual(getHistoryMaxRecords("9"), 30);
  assert.strictEqual(getHistoryMaxRecords("10"), 10);
  assert.strictEqual(getHistoryMaxRecords("30"), 30);
  assert.strictEqual(getHistoryMaxRecords("100"), 100);
  assert.strictEqual(getHistoryMaxRecords("101"), 30);
  assert.strictEqual(getHistoryMaxRecords("bad"), 30);

  {
    const db = makeFakeDb({ health_concerns: makeRecords(29) });
    const result = await pruneCollection({
      db,
      path: "health_concerns",
      maxRecords: 30,
    });
    assert.strictEqual(result.deletedCount, 0);
    assert.strictEqual(Object.keys(db.data.health_concerns).length, 29);
  }

  {
    const db = makeFakeDb({ health_concerns: makeRecords(30) });
    const result = await pruneCollection({
      db,
      path: "health_concerns",
      maxRecords: 30,
    });
    assert.strictEqual(result.deletedCount, 0);
    assert.strictEqual(Object.keys(db.data.health_concerns).length, 30);
  }

  await assertPruneCount(31, 1);
  await assertPruneCount(35, 5);

  {
    const records = makeRecords(30);
    records.same_001 = { createdAtMs: 9999 };
    records.same_000 = { createdAtMs: 9999 };
    const db = makeFakeDb({ health_concerns: records });
    const result = await pruneCollection({
      db,
      path: "health_concerns",
      maxRecords: 30,
    });
    assert.strictEqual(result.deletedCount, 2);
    assert.strictEqual(db.data.health_concerns.key_000, undefined);
    assert.strictEqual(db.data.health_concerns.key_001, undefined);
    assert.ok(db.data.health_concerns.same_000);
    assert.ok(db.data.health_concerns.same_001);
  }

  {
    const records = {};
    for (let index = 0; index < 31; index += 1) {
      const key = `same_${String(index).padStart(3, "0")}`;
      records[key] = { createdAtMs: 9999 };
    }
    const db = makeFakeDb({ health_concerns: records });
    const result = await pruneCollection({
      db,
      path: "health_concerns",
      maxRecords: 30,
    });
    assert.strictEqual(result.deletedCount, 1);
    assert.strictEqual(db.data.health_concerns.same_000, undefined);
    assert.ok(db.data.health_concerns.same_001);
    assert.ok(db.data.health_concerns.same_030);
  }

  {
    const db = makeFakeDb(
      {
        health_concerns: makeRecords(31),
        reminders: makeRecords(31, "reminder"),
        devices: makeRecords(31, "device"),
        commands: {
          pending_001: { status: "pending", createdAtMs: 1 },
        },
        health_concern_dedup: makeRecords(31, "dedup"),
      },
    );
    await pruneCollection({
      db,
      path: "health_concerns",
      maxRecords: 30,
    });
    assert.strictEqual(Object.keys(db.data.health_concerns).length, 30);
    assert.strictEqual(Object.keys(db.data.reminders).length, 31);
    assert.strictEqual(Object.keys(db.data.devices).length, 31);
    assert.strictEqual(Object.keys(db.data.commands).length, 1);
    assert.strictEqual(Object.keys(db.data.health_concern_dedup).length, 31);
  }

  {
    const db = makeFakeDb({ health_concerns: makeRecords(31) }, { failOnce: true });
    const result = await pruneCollection({
      db,
      path: "health_concerns",
      maxRecords: 30,
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(Object.keys(db.data.health_concerns).length, 31);
  }

  console.log("rtdbRetentionService tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
