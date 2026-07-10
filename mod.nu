use std/log
export-env {
    use std/log []
}

export def rebuild [] {
  nix-build
  docker compose up -d --force-recreate server
}

export def build [] {
}

export def start [] {
  docker compose up -d
}

export def stop [] {
  docker compose down
}

export def init_db [] {
  http put http://admin:password@localhost:5984/sumptureg ""
  # The app has no login flow and repo.js syncs anonymously via /api, so the
  # database's _security doc must be opened up for anonymous read/write.
  # CouchDB's implicit default (when unset) is admin-only, which would make
  # every sync request fail with 401.
  http put -t application/json http://admin:password@localhost:5984/sumptureg/_security (
    { members: { names: [], roles: [] }, admins: { names: [], roles: ["_admin"] } } | to json
  )
}

export def seed_categories [] {
  let categories = [
    ["id", "name"];
    ["c0000000-0000-0000-0000-000000000001", "Books"],
    ["c0000000-0000-0000-0000-000000000002", "Cafeteria"],
    ["c0000000-0000-0000-0000-000000000003", "Cereal"],
    ["c0000000-0000-0000-0000-000000000004", "Cleaning supplies"],
    ["c0000000-0000-0000-0000-000000000005", "Clothing"],
    ["c0000000-0000-0000-0000-000000000006", "Courses"],
    ["c0000000-0000-0000-0000-000000000007", "Dry cleaning"],
    ["c0000000-0000-0000-0000-000000000008", "Eating out"],
    ["c0000000-0000-0000-0000-000000000009", "Entertainment"],
    ["c0000000-0000-0000-0000-00000000000a", "Fruit"],
    ["c0000000-0000-0000-0000-00000000000b", "Gifts"],
    ["c0000000-0000-0000-0000-00000000000c", "Health"],
    ["c0000000-0000-0000-0000-00000000000d", "Home improvement"],
    ["c0000000-0000-0000-0000-00000000000e", "Meat"],
    ["c0000000-0000-0000-0000-00000000000f", "Personal care"],
    ["c0000000-0000-0000-0000-000000000010", "Postage"],
    ["c0000000-0000-0000-0000-000000000011", "Restaurants"],
    ["c0000000-0000-0000-0000-000000000012", "Sports"],
    ["c0000000-0000-0000-0000-000000000013", "Stationary"],
    ["c0000000-0000-0000-0000-000000000014", "Transport"],
    ["c0000000-0000-0000-0000-000000000015", "Vegetables"],
    ["c0000000-0000-0000-0000-000000000016", "Yoghurt"],
  ]

  for category in $categories {
    http put -t application/json $"http://admin:password@localhost:5984/sumptureg/($category.id)" ({
      type: "category",
      name: $category.name,
    } | to json)
  }
}

export def nix-build [] {
  nix build
}

export def nix-log [] {
  nix log
}
