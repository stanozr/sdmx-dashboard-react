"use client"

import React, { useState, useEffect, useRef } from "react";
import { HighchartsReact } from "highcharts-react-official";
import Highcharts from 'highcharts';
import highchartsMore from "highcharts/highcharts-more";
import highchartsExporting from "highcharts/modules/exporting";
import highchartsAccessibility from "highcharts/modules/accessibility";
import highchartsExportData from "highcharts/modules/export-data";
import highchartsDumbbell from "highcharts/modules/dumbbell"
import highchartsDrilldown from "highcharts/modules/drilldown"
import highchartsLollipop from "highcharts/modules/lollipop"
// @ts-ignore
import { SDMXParser } from 'sdmx-json-parser';
import { parseTextExpr, parseOperandTextExpr } from '../../utils/parseTextExpr';
import { parseDataExpr } from "../../utils/parseDataExpr";
import { parseDate } from "../../utils/parseDate";
import { InfoCircle } from "react-bootstrap-icons";
import { Button } from "react-bootstrap";
import { SDMXChartConfig } from "../types";
import { AlignValue } from "highcharts";
import { merge } from "ts-deepmerge";

if (typeof Highcharts === 'object') {
    highchartsMore(Highcharts)
    highchartsExporting(Highcharts);
    highchartsAccessibility(Highcharts);
    highchartsDrilldown(Highcharts);
    highchartsDumbbell(Highcharts);
    highchartsLollipop(Highcharts);
    highchartsExportData(Highcharts);
}

interface ChartProps extends HighchartsReact.Props {
    config: SDMXChartConfig;
    language: string;
    placeholder?: React.JSX.Element
}

const Chart = ({ config, language, placeholder, ...props }: ChartProps) => {

    const [hcOptions, setHcOptions] = useState<Highcharts.Options>({
        title: {
            text: "Loading..."
        }
    })

    const [isLoading, setIsLoading] = useState(true)

    const chartComponentRef = useRef<HighchartsReact.RefObject>(null);

    const sortByDimension = (data: any, dimensionId: string) => {

        return data.sort((a: any, b: any) => {
            if (dimensionId === "TIME_PERIOD") {
                return parseInt(a[dimensionId]) - parseInt(b[dimensionId])
            } else {
                return a[dimensionId].localeCompare(b[dimensionId])
            }
        })
    }

    const getLatestValue = (data: any, dimension: string) => {
        let values  = []
        values = data.map((dataPoint: any) => dataPoint[dimension])
                    .map((e: any, i: number, final: any) => final.indexOf(e) === i && i)
                    .filter((e: any) => data[e]).map((e: any) => data[e])
        return values;
    }

    useEffect(() => {

        const dataObjs = parseDataExpr(config.data);

        if (config.download) {
            // ExportData(Highcharts)
        }

        const chartType = config.type
        if (!chartType) {
            throw new Error('Chart type not defined');
        }
        const hcExtraOptions: Highcharts.Options = {
            plotOptions: {
                [chartType]: {}
            },
        };

        let seriesData: any[] = [];
        let xAxisValue: any[] = [];

        const dataPromises = dataObjs.map((dataObj) => {
            const parser = new SDMXParser();
            return parser.getDatasets(dataObj.dataFlowUrl, {
                headers: new Headers({
                    Accept: "application/vnd.sdmx.data+json;version=2.0.0",
                    "Accept-Language": language
                })
            }).then(() => {
                let data = parser.getData();
                const attributes = parser.getAttributes();
                // if alternate label specified in the DATA field, the label is appended to the data with key xAxisConcept
                if (dataObj.alternateLabel) {
                    data.forEach((_dataItem: any, index: number, data: [any]) => {
                        data[index][config.xAxisConcept] = dataObj.alternateLabel;
                    });
                }
                // if operation specified in the DATA field, it is applied here whether the operand is an attribute or another SDMX request
                if (dataObj.operator) {
                    if (dataObj.operator === 'hist') {
                        // we compute the histogram of values along the xAxisConcept
                        // we also need to get all the values for the xAxisConcept dimension to take into account the 'no-data'
                        let histData: any[] = []
                        data.forEach((_dataItem: any) => {
                            let histItemIndex = histData.findIndex(item => {
                                if (item.binValue === _dataItem.value) {
                                    let found = true
                                    return found
                                } else {
                                    return false
                                }
                            })
                            if (histItemIndex === -1) {
                                let histItem: any = {}
                                histItem[config.xAxisConcept] = _dataItem[config.xAxisConcept]
                                histItem.value = 1
                                histItem.binValue = _dataItem.value
                                histData.push(histItem)
                            } else {
                                histData[histItemIndex].value += 1
                                histData[histItemIndex][config.xAxisConcept] = `${histData[histItemIndex][config.xAxisConcept]}<br/>${_dataItem[config.xAxisConcept]}`
                            }
                        })
                        return [histData, parser.getDimensions()]

                    } else {
                        if (dataObj.operand.startsWith('{')) {
                            // operand is an attribute
                            const operandValue = parseOperandTextExpr(dataObj.operand, data[0], attributes);
                            data.forEach((_dataItem: any, index: number, data: [any]) => {
                                data[index].value = eval(`${data[index].value} ${dataObj.operator} ${operandValue}`);
                            });
                            return [data, parser.getDimensions()];
                        } else {
                            // operand is another SDMX request
                            const parserOperand = new SDMXParser();
                            return parserOperand.getDatasets(dataObj.operand, {
                                headers: new Headers({
                                    Accept: "application/vnd.sdmx.data+json;version=2.0.0",
                                })
                            }).then(() => {
                                const dataOperand = parserOperand.getData();
                                const operandValue = dataOperand[0].value;
                                data.forEach((_dataItem: any, index: number, data: [any]) => {
                                    data[index].value = eval(`${data[index].value} ${dataObj.operator} ${operandValue}`);
                                });
                                return [data, parser.getDimensions()];
                            });
                        }
                    }
                } else {
                    return [data, parser.getDimensions(), parser.getActiveDimensions()];
                }
            })
        });
        let titleText = config.title?'Loading...':'';
        let subtitleText = config.subtitle?'Loading...':'';
        Promise.all(dataPromises).then((sdmxObjs) => {
            sdmxObjs.forEach((sdmxObj: any) => {
                const data = sdmxObj[0];
                const dimensions = sdmxObj[1];
                const activeDimensions = sdmxObj[2];

                if(typeof config.title == 'string') {
                    titleText = parseTextExpr(config.title, dimensions)
                } else if (typeof config.title === 'object') {
                    titleText = typeof config.title.text == 'string'? parseTextExpr(config.title.text, dimensions) : parseTextExpr(config.title.text[language], dimensions)
                }
                if(typeof config.subtitle == 'string') {
                    subtitleText = parseTextExpr(config.subtitle, dimensions)
                } else if (typeof config.subtitle === 'object') {
                    subtitleText = typeof config.subtitle.text == 'string'? parseTextExpr(config.subtitle.text, dimensions) : parseTextExpr(config.subtitle.text[language], dimensions)
                }

                // check if xAxisConcept exists in data
                if (config.xAxisConcept && config.xAxisConcept !== 'MULTI') {
                    const xAxisDimension = dimensions.find((dimension: any) => dimension.id === config.xAxisConcept);
                    if (!xAxisDimension) {
                        throw new Error(`xAxisConcept ${config.xAxisConcept} not found in dataflow`);
                    }
                }
                // check if legendConcept exists in dataFlow
                if (config.legend && config.legend.concept && config.legend.concept !== 'MULTI') {
                    const legendDimension = dimensions.find((dimension: any) => dimension.id === config?.legend?.concept);
                    if (!legendDimension) {
                        throw new Error(`legendConcept ${config.legend.concept} not found in dataflow`);
                    }
                }

                let xAxisConcept = config.xAxisConcept;
                let legendConcept = config?.legend?.concept || "";

                if (chartType === 'line') {
                    // in case xAxisConcept is empty, we use TIME_PERIOD
                    xAxisConcept = config.xAxisConcept || 'TIME_PERIOD';
                    // in case legendConcept is empty, we use the first dimension which is not TIME_PERIOD
                    legendConcept = config?.legend?.concept || dimensions.find((dimension: any) => dimension.id !== xAxisConcept)['id']
                    if (!legendConcept) {
                        throw new Error(`No other dimension than ${xAxisConcept} found`);
                    }
                    // for (multiple) line charts, we create multiple series for each legendConcept dimension values and using xAxisConcept as the x-axis dimension
                    let serieDimensions = dimensions.find((dimension: any) => dimension.id === legendConcept);
                    if (xAxisConcept === "TIME_PERIOD") {
                        // we assume that line charts have a time dimension represented on x-axis
                        const freqDimension = dimensions.find((dimension: any) => dimension.id === "FREQ");
                        let unit = '';
                        let xAxisLabelformat = '';
                        if (freqDimension.values[0].id === "A") {
                            unit = "year";
                            xAxisLabelformat = "{value:%Y}";
                        } else if (freqDimension.values[0].id === "Q" || freqDimension.values[0].id === 'M') {
                            unit = "month";
                            xAxisLabelformat = "{value:%b %Y}";
                        }
                        hcExtraOptions["xAxis"] = {
                            type: "datetime",
                            units: [[unit, []]],
                            labels: {
                                format: xAxisLabelformat
                            }
                        }
                    } else {
                        hcExtraOptions["xAxis"] = {
                            type: "category",
                            categories: data.map((val: any) => val[xAxisConcept])
                        }
                    }
                    serieDimensions.values.sort((a: any, b: any) => a.name.localeCompare(b.name)).forEach((serieDimension: any) => {
                        // a serie is created for each of the serie's dimension value
                        const serieData = data.filter((val: any) => val[legendConcept||""] === serieDimension.name);
                        if(serieData.length == 0) {
                          // continue if no data for this serie
                          return
                        }
                        const sortedData = sortByDimension(serieData, xAxisConcept);
                        const yAxisValue = sortedData.map((val: any) => {
                            return {
                                //...dimensionSingleValues,
                                ...val,
                                y: val["value"],
                                x: parseDate(val[xAxisConcept])
                            };
                        });
                        let serieDataObj: any = {
                            name: serieDimension.name,
                            data: yAxisValue,
                        }
                        if (config.colorPalette && Object.keys(config.colorPalette).includes(legendConcept)) {
                            serieDataObj['color'] = config.colorPalette[legendConcept][serieDimension.id]
                        }

                        seriesData.push(serieDataObj);
                    });
                } else if (chartType === 'column' || chartType === 'bar' || chartType === 'lollipop') {
                    xAxisConcept = config.xAxisConcept;
                    if (!xAxisConcept) {
                        throw new Error('No xAxis concept found')
                    }
                    legendConcept = config?.legend?.concept || "";
                    let serieDimension: any = {}
                    // in case legendConcept is empty, we take the other active dimension and display a serie for each value
                    if (!legendConcept) {
                        serieDimension = activeDimensions.find((dimension: any) => dimension.id !== xAxisConcept)
                    } else {
                        serieDimension = dimensions.find((dimension: any) => dimension.id === legendConcept)
                    }
                    serieDimension.values.sort((a: any, b: any) => a.id.localeCompare(b.id)).forEach((serieDimensionValue: any) => {
                        const serieData = data.filter((val: any) => val[serieDimension.id] === serieDimensionValue.name);
                        const sortedData = sortByDimension(serieData, xAxisConcept)
                        const latestValues = getLatestValue(sortedData, xAxisConcept)
                        const yAxisValue = latestValues
                            .filter((val: any) => val.value !== null ) // remove null values from chart
                            .map((val: any) => {
                            return {
                                ...val,
                                y: val["value"],
                                name: val[xAxisConcept]
                            }
                        })

                        // add category to xAxis
                        yAxisValue.forEach((val: any) => {
                            if (!xAxisValue.includes(val[xAxisConcept])) {
                                xAxisValue.push(val[xAxisConcept])
                            }
                        });
                        if (yAxisValue.length > 0) {
                            let serieDataObj: any = {
                                name: serieDimensionValue.name,
                                data: yAxisValue,
                            }
                            if (config.colorPalette && Object.keys(config.colorPalette).includes(legendConcept)) {
                                serieDataObj["color"] = config.colorPalette[legendConcept][serieDimensionValue.id]
                            }
                            seriesData.push(serieDataObj)
                        }
                    })

                    hcExtraOptions["xAxis"] = {
                        categories: xAxisValue.sort(),
                        type: 'category'
                    }

                } else if (chartType === 'drilldown') {
                    const xAxisConcept = config.xAxisConcept;
                    const legendConcept = config?.legend?.concept;
                    const drilldownXAxisConcept = config.drilldown?.xAxisConcept;
                    if (!drilldownXAxisConcept) {
                        throw new Error('No drilldown xAxis concept found')
                    }
                    if (!legendConcept) {
                        throw new Error('No legend concept found')
                    }
                    const xAxisDimension = dimensions.find((dimension: any) => dimension.id === xAxisConcept);
                    const legendDimension = dimensions.find((dimension: any) => dimension.id === legendConcept);
                    // const drilldownXAxisDimension = dimensions.find((dimension: any) => dimension.id === drilldownXAxisConcept)

                    let dataDrilldownData: any[] = []
                    legendDimension.values.sort((a: any, b: any) => a.id.localeCompare(b.id)).forEach((legendDimensionValue: any) => {
                        const legendSerie = data.filter((val: any) => val[legendConcept] === legendDimensionValue.name);
                        let legendSerieData: any[] = []
                        xAxisDimension.values.forEach((xAxisDimensionValue: any) => {
                            let tmpArr = legendSerie
                                .filter((val: any) => val[xAxisConcept] === xAxisDimensionValue.name)
                                .filter((val: any) => val[legendConcept] === legendDimensionValue.name)

                            // sort data by drilldownXAxisConcept ASC
                            tmpArr = sortByDimension(tmpArr, drilldownXAxisConcept)
                            // either the "Total" value or the latest value is used to display in the column chart of drilldown
                            let legendSerieDataValue = tmpArr.find((val: any) => val[drilldownXAxisConcept] === "Total")
                            if (drilldownXAxisConcept === "TIME_PERIOD") {
                                legendSerieDataValue = tmpArr[tmpArr.length - 1]
                            } else {
                                // filter out the "Total" value from the drilled down data array
                                tmpArr = tmpArr.filter((val: any) => val[drilldownXAxisConcept] !== "Total")
                            }

                            if (tmpArr.length === 0) {
                                return
                            }
                            // add category to xAxis
                            if (!xAxisValue.includes(xAxisDimensionValue.name)) {
                                xAxisValue.push(xAxisDimensionValue.name)
                            }
                            let legendSerieDataObj: any = {
                                ...legendSerieDataValue,
                                name: xAxisDimensionValue.name,
                                drilldown: `${xAxisDimensionValue.name}-${legendDimensionValue.name}`,
                                y: legendSerieDataValue["value"]
                            }
                            legendSerieData.push(legendSerieDataObj);

                            let drilldownSerieObj: any = {
                                id: `${xAxisDimensionValue.name}-${legendDimensionValue.name}`,
                                type: (drilldownXAxisConcept === "TIME_PERIOD" ? 'line' : 'column'),
                                name: `${legendDimensionValue.name}`,
                                data: tmpArr.map((value: any) => {
                                    return {
                                        ...value,
                                        name: value[drilldownXAxisConcept],
                                        y: value["value"]
                                    }
                                })
                            }
                            // depending on what is available in the passed object config `colorPalette` we use them to color the series
                            if (config.colorPalette && Object.keys(config.colorPalette).includes(legendConcept)) {
                                // if colorPalette specifies a color based on the legendConcept, we apply it to the drilldown serie
                                drilldownSerieObj["color"] = config.colorPalette[legendConcept][legendDimensionValue.id]
                            } else if (config.colorPalette && Object.keys(config.colorPalette).includes(xAxisConcept)) {
                                // else if colorPalette specifies a color based on the xAxisConcept, we apply it
                                drilldownSerieObj["color"] = config.colorPalette[xAxisConcept][xAxisDimensionValue.id]
                            }

                            if (config.colorPalette && Object.keys(config.colorPalette).includes(drilldownXAxisConcept)) {
                                // on top of that, if colorPalette specifies a color based on the drilldownXAxisConcept, we apply it to the drilldown serie
                                drilldownSerieObj.data = drilldownSerieObj.data.map((item: any) => {
                                    const dimId = dimensions.find((dim: any) => dim.id === drilldownXAxisConcept).values.find((val: any) => val.name === item[drilldownXAxisConcept]).id
                                    return {
                                        ...item,
                                        color: config.colorPalette?.[drilldownXAxisConcept][dimId]
                                    }
                                })
                            }

                            dataDrilldownData.push(drilldownSerieObj)
                        })


                        if (legendSerieData.length !== 0) {
                            let seriesDataObj: any = {
                                name: legendDimensionValue.name,
                                data: legendSerieData.sort((a: any, b: any) => {
                                    return a[xAxisDimension.id].localeCompare(b[xAxisDimension.id])
                                })
                            }
                            if (config.colorPalette && Object.keys(config.colorPalette).includes(legendConcept)) {
                                seriesDataObj["color"] = config.colorPalette[legendConcept][legendDimensionValue.id]
                            }
                            seriesData.push(seriesDataObj)
                        }

                    })
                    hcExtraOptions["drilldown"] = {
                        allowPointDrilldown: false,
                        series: dataDrilldownData
                    }
                    hcExtraOptions["xAxis"] = {
                        categories: xAxisValue.sort(),
                        type: 'category'
                    }
                } else if (chartType === 'pie') {
                    // other chart type (bar, pie) only one serie is created using the dimension specified in xAxisConcept
                    const sortedData = sortByDimension(data, xAxisConcept);
                    xAxisValue = sortedData.map((val: any) => {
                        return val[xAxisConcept];
                    });
                    hcExtraOptions["xAxis"] = {
                        type: 'category',
                        categories: xAxisValue
                    }
                    const yAxisValue = sortedData.map((val: any) => {
                        return {
                            ...val,
                            y: val["value"],
                            name: xAxisConcept ? val[xAxisConcept] : val[legendConcept || ""],
                        };
                    });

                    // in case of "boolean" pie chart with only 2 values resulting of a hist, we order values DESC (true first)
                    if (yAxisValue.length == 2 && Object.keys(yAxisValue[0]).includes("binValue")) {
                        yAxisValue.sort((a: any, b: any) => b.binValue - a.binValue)
                    }

                    if (config.labels) {
                        hcExtraOptions["plotOptions"] = {
                            [chartType]: {
                                dataLabels: {
                                    enabled: true,
                                    formatter: function (this: any) {
                                        if (config?.unit?.text === '%') {
                                            return `${this.point?.name}: ${this.point?.percentage.toFixed(config.decimals)} %`
                                        } else {
                                            return `${this.point?.y?.toLocaleString(language)}`
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // force legend for Pie charts
                    if (config.legend && chartType === 'pie') {
                        hcExtraOptions["plotOptions"] = {
                            [chartType]: {
                                showInLegend: true
                            }
                        }
                    }

                    // append data to the serie
                    if (seriesData.length === 0) {
                        seriesData = [{
                            name: titleText || dimensions.find((dim: any) => dim.id === config.legend?.concept).values[0].name,
                            data: yAxisValue,
                        },];
                    } else {
                        seriesData[0].data.push(...yAxisValue);
                    }
                }
            })
            let legendAlign: AlignValue = "center"
            if (config?.legend?.location) {
                if (config.legend.location == "left" || config.legend.location == "right") {
                    legendAlign = config.legend.location
                }
            }
            if (config.labels) {
                hcExtraOptions["plotOptions"]= {
                    [chartType] : {
                        dataLabels: {
                            enabled: true,
                            formatter: function (this: any) {
                                if (config?.unit?.text === '%') {
                                    if (chartType === "pie") {
                                        return `${this.point?.name}: ${this.point?.percentage.toFixed(config.decimals)} %`
                                    } else {
                                        return `${this.point?.percentage.toFixed(config.decimals)} %`
                                    }
                                } else {
                                    return `${this.point?.y?.toLocaleString(language)}`
                                }
                            }
                        }
                    }
                }
            }

            setIsLoading(false)

            setHcOptions(merge({
                chart: {
                    type: chartType === 'drilldown' ? 'column' : chartType,
                },
                title: {
                    useHTML: true,
                    text: `<h2 style="font-weight:inherit;font-size:inherit;font-style:inherit;">${titleText}${config.metadataLink?<Button variant="link" onClick={() => window.open(config.metadataLink, "_blank")}><InfoCircle></InfoCircle></Button>:""}</h2>`,
                    style: {
                        fontWeight: config.title?.weight? config.title.weight : "",
                        fontStyle: config.title?.style,
                        fontSize: config.title?.size
                    },
                    align: config.title?.align || "center"
                },
                subtitle: {
                    text: `<h4>${subtitleText}</h4>`,
                    style: {
                        fontWeight: config.subtitle?.weight || "",
                        fontStyle: config.subtitle?.style || "",
                        fontSize: config.subtitle?.size
                    },
                    align: config.subtitle?.align || "center"
                },
                legend: {
                    enabled: config.legend?.location !== "none" ? true:false,
                    align: legendAlign
                },
                series: seriesData
            }, hcExtraOptions || {}, config.extraOptions || {}));
        })
    }, [config, language]);

    const chart: React.ReactNode =
        <HighchartsReact
            highcharts={Highcharts}
            options={hcOptions}
            ref={chartComponentRef}
            containerProps={{ ...props, className: `${props.className} ${config.frame && config.frame ? "border" : ""}`}}
        />

    return (
        <>
            {isLoading ? placeholder || <div className="opacity-50 d-table-cell align-middle" style={{ "height": 400, "width": 600 }}>Loading...</div>
            :  config.dataLink ? <a href={ config.dataLink} target="_blank" rel="noreferrer">{chart}</a>
                : chart
            }
        </>
    )
}

export default Chart;
