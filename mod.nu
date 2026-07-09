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
    http put $"http://admin:password@localhost:5984/sumptureg/($category.id)" {
      type: "category",
      name: $category.name,
    }
  }
}

export def nix-build [] {
  nix build
}

export def nix-log [] {
  nix log
}
