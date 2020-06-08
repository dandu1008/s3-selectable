import {
  getSQLWhereAST,
  getSQLWhereString,
  getSQLWhereStringFromAST,
  makePartitionSpecificAST,
  getTableAndDb,
} from "./sql-query.helper";

describe("it getting db and table from SQL clause", () => {
  it("should work with correct select", () => {
    expect(getTableAndDb("SELECT * FROM db.t")).toEqual(["db", "t"]);
  });
  it("should throw with non SQL string", () => {
    expect(() => getTableAndDb("SELECT TABLE")).toThrowError();
  });
  it("should throw with non SQL string", () => {
    expect(() => getTableAndDb("SELECT (1,2)")).toThrowError("Only SELECT queries with FROM are supported");
  });
  it("should work with correct select", () => {
    expect(getTableAndDb("SELECT * FROM db.t LIMIT 10")).toEqual(["db", "t"]);
  });
  it("no multiple querier", () => {
    expect(() => getTableAndDb("SELECT * FROM db.t; SELECT * FROM db2.t2")).toThrowError(
      "Multiple queries not supported",
    );
  });
  it("Single table FROM only", () => {
    expect(() => getTableAndDb("SELECT * FROM db.t AS t, db2.t2 as t2")).toThrowError(
      "Only single table sources supported for now",
    );
  });
  it("No FROM DUAL", () => {
    expect(() => getTableAndDb("SELECT * FROM DUAL")).toThrowError("DUAL not supported");
  });
  it("Both db and table must be given", () => {
    expect(() => getTableAndDb("SELECT * FROM t")).toThrowError("Both db and table needed");
  });
  it("should throw on a simple incorrect from db. t", () => {
    expect(getTableAndDb("SELECT * FROM db. t LIMIT 10")).toEqual(["db", "t"]);
  });
  it("should throw on a simpl incorrect from db .t", () => {
    expect(getTableAndDb("SELECT * FROM db .t LIMIT 10")).toEqual(["db", "t"]);
  });
  it("should throw on a simpl incorrect from catalog.db.t", () => {
    expect(() => getTableAndDb("SELECT * FROM catalog.db.t LIMIT 10")).toThrowError();
  });
  it("should throw on a missing table", () => {
    expect(() => getTableAndDb("SELECT * FROM")).toThrowError();
  });
  it("should throw on a missing table 2", () => {
    expect(() => getTableAndDb("SELECT * FROM ")).toThrowError();
  });
  it("should throw when query is not SELECT", () => {
    expect(() => getTableAndDb("DROP TABLE t")).toThrowError("Only SELECT queries are supported");
  });
});

describe("SQL WHERE clauses", () => {
  it("with single clause", () => {
    const sql = "SELECT * FROM s3Object WHERE part=0";
    const expected = {
      left: {
        column: "part",
        table: null,
        type: "column_ref",
      },
      operator: "=",
      right: {
        type: "number",
        value: 0,
      },
      type: "binary_expr",
    };
    expect(getSQLWhereAST(sql)).toEqual(expected);
  });

  it("without WHERE", () => {
    const sql = "SELECT * FROM s3Object";
    const expected = null;
    expect(getSQLWhereAST(sql)).toEqual(expected);
  });

  it("without WHERE with partition specific WHERE mutation", () => {
    const sql = "SELECT * FROM s3Object";
    const expected = null;
    expect(makePartitionSpecificAST(getSQLWhereAST(sql), [])).toEqual(expected);
  });

  it("only SELECT queries", () => {
    const sql = "SHOW CATALOGS";
    expect(() => makePartitionSpecificAST(getSQLWhereAST(sql), [])).toThrowError();
  });

  it("only SELECT queries", () => {
    const sql = "UPDATE TABLE";
    expect(() => makePartitionSpecificAST(getSQLWhereAST(sql), [])).toThrowError();
  });

  it("set non-partition clauses true, one partition column", () => {
    const sql = "SELECT * FROM s3Object WHERE year<=2020 AND 9<=month AND(foo=1 OR 2=bar) AND true";
    expect(getSQLWhereStringFromAST(makePartitionSpecificAST(getSQLWhereAST(sql), ["year", "month", "day"]))).toEqual(
      "WHERE `year` <= 2020 AND 9 <= `month` AND (TRUE OR TRUE) AND TRUE",
    );
  });

  it("set non-partition clauses true, no partition columns", () => {
    const sql = "SELECT * FROM s3Object WHERE (foo=1 OR bar=2) AND true";
    expect(getSQLWhereStringFromAST(makePartitionSpecificAST(getSQLWhereAST(sql), ["year", "month", "day"]))).toEqual(
      "WHERE (TRUE OR TRUE) AND TRUE",
    );
  });

  it("with two clauses", () => {
    const sql = "SELECT * FROM s3Object WHERE year<=2020 AND month>=2";
    const expected = {
      left: {
        left: {
          column: "year",
          table: null,
          type: "column_ref",
        },
        operator: "<=",
        right: {
          type: "number",
          value: 2020,
        },
        type: "binary_expr",
      },
      operator: "AND",
      right: {
        left: {
          column: "month",
          table: null,
          type: "column_ref",
        },
        operator: ">=",
        right: {
          type: "number",
          value: 2,
        },
        type: "binary_expr",
      },
      type: "binary_expr",
    };
    expect(getSQLWhereAST(sql)).toEqual(expected);
    expect(getSQLWhereString(sql, ["year", "month", "day"])).toEqual("WHERE `year` <= 2020 AND `month` >= 2");
  });

  it("with subclauses", () => {
    const sql =
      "SELECT * FROM s3Object WHERE " +
      "(year<=2020 AND month>=2 AND title='hello') OR " +
      "(year>2020 AND month<10) AND true";
    const expected = {
      left: {
        left: {
          left: {
            left: {
              column: "year",
              table: null,
              type: "column_ref",
            },
            operator: "<=",
            right: {
              type: "number",
              value: 2020,
            },
            type: "binary_expr",
          },
          operator: "AND",
          right: {
            left: {
              column: "month",
              table: null,
              type: "column_ref",
            },
            operator: ">=",
            right: {
              type: "number",
              value: 2,
            },
            type: "binary_expr",
          },
          type: "binary_expr",
        },
        operator: "AND",
        parentheses: true,
        right: {
          left: {
            column: "title",
            table: null,
            type: "column_ref",
          },
          operator: "=",
          right: {
            type: "string",
            value: "hello",
          },
          type: "binary_expr",
        },
        type: "binary_expr",
      },
      operator: "OR",
      right: {
        left: {
          left: {
            left: {
              column: "year",
              table: null,
              type: "column_ref",
            },
            operator: ">",
            right: {
              type: "number",
              value: 2020,
            },
            type: "binary_expr",
          },
          operator: "AND",
          parentheses: true,
          right: {
            left: {
              column: "month",
              table: null,
              type: "column_ref",
            },
            operator: "<",
            right: {
              type: "number",
              value: 10,
            },
            type: "binary_expr",
          },
          type: "binary_expr",
        },
        operator: "AND",
        right: {
          type: "bool",
          value: true,
        },
        type: "binary_expr",
      },
      type: "binary_expr",
    };
    expect(getSQLWhereAST(sql)).toEqual(expected);
    expect(getSQLWhereString(sql, ["year", "month", "day"])).toEqual(
      "WHERE (`year` <= 2020 AND `month` >= 2 AND TRUE) OR (`year` > 2020 AND `month` < 10) AND TRUE",
    );
  });
});