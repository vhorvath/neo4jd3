/* global d3, document */
/* jshint latedef:nofunc */
'use strict';

const fa = require('./fa');

function Neo4jD3(_selector, _options) {
    let container, info, node, nodes, relationship, relationshipOutline, 
        relationshipOverlay, relationshipText, relationships, selector, 
        simulation, svg, svgNodes, svgRelationships, svgScale,
        svgTranslate_x = 0, svgTranslate_y = 0, justLoaded = false, numClasses = 0;

    const classes2colors = {},
          options = {
            arrowSize: 4,
            colors: {},
            highlight: null,
            iconMap: {},
            icons: null,
            imageMap: {},
            images: null,
            infoPanel: true,
            minCollision: null,
            neo4jData: null,
            neo4jDataUrl: null,
            nodeOutlineFillColor: null,
            nodeRadius: 25,
            relationshipColor: '#a5abb6',
            zoomFit: false,
            onNodeClick: () => {},
            onNodeDoubleClick: () => {},
            onNodeDragStart: () => {},
            onNodeDragEnd: () => {},
            onNodeMouseEnter: () => {},
            onNodeMouseLeave: () => {},
            onRelationshipDoubleClick: () => {},
        };

    const VERSION = '0.0.2';

    function appendGraph(container) {
        let scale, translate_x, translate_y;
        svg = container.append('svg')
                       .attr('width', '100%')
                       .attr('height', '100%')
                       .attr('class', 'neo4jd3-graph')
                       .call(d3.zoom().on('zoom', () => {
                            scale = d3.event.transform.k * (svgScale || 1);
                            translate_x = d3.event.transform.x + svgTranslate_x;
                            translate_y = d3.event.transform.y + svgTranslate_y;
                            svg.attr('transform', `translate(${translate_x}, ${translate_y}) scale(${scale})`);
                       }))
                       .on('dblclick.zoom', null)
                       .append('g')
                       .attr('width', '100%')
                       .attr('height', '100%');

        svgRelationships = svg.append('g')
                              .attr('class', 'relationships');

        svgNodes = svg.append('g')
                      .attr('class', 'nodes');
    }

    function appendImageToNode(node) {
        return node.append('image')
                   .attr('height', d => d.icon ? '24px': '30px')
                   .attr('x', d => d.icon ? '5px': '-15px')
                   .attr('xlink:href', d => d.image)
                   .attr('y', d => d.icon ? '5px': '-16px')
                   .attr('width', d => d.icon ? '24px': '30px');
    }

    function appendInfoPanel(container) {
        return container.append('div')
                        .attr('class', 'neo4jd3-info');
    }

    function appendInfoElement(cls, isNode, property, value) {
        const elem = info.append('a');
        const val = value ? `: ${value}` : '';

        elem.attr('href', '#')
            .attr('class', cls)
            .html(`<strong>${property}</strong>${val}`);

        if (value) {return;}

        elem.style('background-color', () => options.nodeOutlineFillColor ? options.nodeOutlineFillColor : (isNode ? class2color(property) : defaultColor()))
            .style('border-color', () => options.nodeOutlineFillColor ? class2darkenColor(options.nodeOutlineFillColor) : (isNode ? class2darkenColor(property) : defaultDarkenColor()))
            .style('color', () => options.nodeOutlineFillColor ? class2darkenColor(options.nodeOutlineFillColor) : '#fff');
    }

    function appendInfoElementClass(cls, node) {
        appendInfoElement(cls, true, node);
    }

    function appendInfoElementProperty(cls, property, value) {
        appendInfoElement(cls, false, property, value);
    }

    function appendInfoElementRelationship(cls, relationship) {
        appendInfoElement(cls, false, relationship);
    }

    function appendNode() {
        return node.enter()
                   .append('g')
                   .attr('class', d => {
                        const highlights = options.highlight || [],
                              primary_label = d.labels[0],
                              classes = ['node'];

                        if (d.icon) {classes.push('node-icon');}
                        if (d.image) {classes.push('node-image');}

                        if (highlights.some(highlight => (primary_label === highlight.class) && (d.properties[highlight.property] === highlight.value))) {
                            classes.push('node-highlighted');
                        }

                        return classes.join(' ');
                   })
                   .on('click', d => {
                        d.fx = d.fy = null;
                        options.onNodeClick(d);
                   })
                   .on('dblclick', d => {
                        stickNode(d);
                        options.onNodeDoubleClick(d);
                   })
                   .on('mouseenter', d => {
                        if (info) {
                            updateInfo(d);
                        }
                        options.onNodeMouseEnter(d);
                   })
                   .on('mouseleave', d => {
                        if (info) {
                            clearInfo(d);
                        }
                        options.onNodeMouseLeave(d);
                   })
                   .call(d3.drag()
                           .on('start', dragStarted)
                           .on('drag', dragged)
                           .on('end', dragEnded));
    }

    function appendNodeToGraph() {
        let n = appendNode();

        appendRingToNode(n);
        appendOutlineToNode(n);

        if (options.icons) {appendIconToNode(n);}
        if (options.images) {appendImageToNode(n);}

        return n;
    }

    function appendOutlineToNode(node) {
        return node.append('circle')
                   .attr('class', 'outline')
                   .attr('r', options.nodeRadius)
                   .style('fill', d => options.nodeOutlineFillColor ? options.nodeOutlineFillColor : class2color(d.labels[0]))
                   .style('stroke', d => options.nodeOutlineFillColor ? class2darkenColor(options.nodeOutlineFillColor) : class2darkenColor(d.labels[0]))
                   .append('title').text(d => toString(d));
    }

    function appendRingToNode(node) {
        return node.append('circle')
                   .attr('class', 'ring')
                   .attr('r', options.nodeRadius * 1.16)
                   .append('title').text(d => toString(d));
    }

    function appendIconToNode(node) {
        return node.append('text')
                   .attr('class', d => d.icon ? 'text icon' : 'text')
                   .attr('fill', '#ffffff')
                   .attr('font-size', d => d.icon ? `${options.nodeRadius}px` : '10px')
                   .attr('pointer-events', 'none')
                   .attr('text-anchor', 'middle')
                   .attr('y', d => d.icon ? `${Math.round(options.nodeRadius * 0.32)}px` : '4px')
                   .html(d => {
                       const _icon = d.icon;
                       return _icon ? '&#x' + _icon : d.id;
                   });
    }

    function appendRandomDataToNode(d, maxNodesToGenerate) {
        const data = randomD3Data(d, maxNodesToGenerate);
        updateWithNeo4jData(data);
    }

    function appendRelationship() {
        return relationship.enter()
                           .append('g')
                           .attr('class', 'relationship')
                           .on('dblclick', options.onRelationshipDoubleClick)
                           .on('mouseenter', d => {
                               if (info) {
                                   updateInfo(d);
                               }
                           });
    }

    function appendOutlineToRelationship(r) {
        return r.append('path')
                .attr('class', 'outline')
                .attr('fill', options.relationshipColor)
                .attr('stroke', 'none');
    }

    function appendOverlayToRelationship(r) {
        return r.append('path')
                .attr('class', 'overlay');
    }

    function appendTextToRelationship(r) {
        return r.append('text')
                .attr('class', 'text')
                .attr('fill', '#000')
                .attr('font-size', '8px')
                .attr('pointer-events', 'none')
                .attr('text-anchor', 'middle')
                .text(d => d.type);
    }

    function appendRelationshipToGraph() {
        const relationship = appendRelationship();

        return {
            relationship: relationship,
            text: appendTextToRelationship(relationship),
            outline: appendOutlineToRelationship(relationship),
            overlay: appendOverlayToRelationship(relationship)
        };
    }

    function class2color(cls) {
        let color = classes2colors[cls];
        if (color) {return color;}

        color = options.colors[numClasses % options.colors.length];
        classes2colors[cls] = color;
        numClasses++;

        return color;
    }

    function class2darkenColor(cls) {
        return d3.rgb(class2color(cls)).darker(1);
    }

    function clearInfo() {
        info.html('');
    }

    function colors() {
        // d3.schemeCategory10,
        // d3.schemeCategory20,
        return [
            '#68bdf6', // light blue
            '#6dce9e', // green #1
            '#faafc2', // light pink
            '#f2baf6', // purple
            '#ff928c', // light red
            '#fcea7e', // light yellow
            '#ffc766', // light orange
            '#405f9e', // navy blue
            '#a5abb6', // dark gray
            '#78cecb', // green #2,
            '#b88cbb', // dark purple
            '#ced2d9', // light gray
            '#e84646', // dark red
            '#fa5f86', // dark pink
            '#ffab1a', // dark orange
            '#fcda19', // dark yellow
            '#797b80', // black
            '#c9d96f', // pistacchio
            '#47991f', // green #3
            '#70edee', // turquoise
            '#ff75ea'  // pink
        ];
    }

    function defaultColor() {
        return options.relationshipColor;
    }

    function defaultDarkenColor() {
        return d3.rgb(options.colors[options.colors.length - 1]).darker(1);
    }

    function dragEnded(d) {
        if (!d3.event.active) {
            simulation.alphaTarget(0);
        }

        options.onNodeDragEnd(d);
    }

    function dragged(d) {
        stickNode(d);
    }

    function dragStarted(d) {
        if (!d3.event.active) {
            simulation.alphaTarget(0.3).restart();
        }

        d.fx = d.x;
        d.fy = d.y;
        options.onNodeDragStart(d);
    }

    function icon(d) {
        const {iconMap, showIcons, icons} = options;

        if (!(iconMap && showIcons && icons)) {return;}

        const primary_label = d.labels[0],
              FA_label = icons[primary_label],
              mapped_icon = iconMap[FA_label];

        // Highest priority: primary icon that is remapped onto an image
        if ((FA_label && mapped_icon)) {return mapped_icon;}

        // Medium priority (fallback 1): label that is mapped onto an image
        const image_by_label = iconMap[primary_label];        
        if (image_by_label) {return image_by_label;}

        // Lowest priority (final fallback): label that maps onto an icon
        return FA_label;
    }

    function image(d) {
        if (!options.images) {return;}

        const primary_label = d.labels[0];
        const imagesForLabel = options.imageMap[primary_label];

        if (!imagesForLabel) {return;}

        let property, value, image, image_src;

        imagesForLabel.forEach(propertyValueImage => {
            if (image_src) {return;}

            [property, value, image] = propertyValueImage;

            // Only the label matches this will match last in ordered list
            if ((!property) && (!value)) {
                image_src = image;
                return;
            }

            // Both property and value must match for below (most specific case)
            if (!d.properties[property]) {return;}
            if ((!value) || (d.properties[property] !== value)) {return;}

            image_src = image;
        });

        return image_src;
    }

    function init(_selector, _options) {
        Object.keys(options).forEach(key => {
            if (options[key] instanceof Function) {
                if (!(_options[key] instanceof Function)) {return;}
            }

            options[key] = _options[key] || options[key];
        });

        options.colors = _options.colors || colors();
        options.iconMap = _options.iconMap || fa.fontAwesomeIcons;

        initIconMap();

        options.showIcons = !!options.icons;

        if (!options.minCollision) {
            options.minCollision = options.nodeRadius * 2;
        }

        initImageMap();

        selector = _selector;

        container = d3.select(selector);

        container.attr('class', 'neo4jd3')
                 .html('');

        if (options.infoPanel) {
            info = appendInfoPanel(container);
        }

        appendGraph(container);

        simulation = initSimulation();

        if (options.neo4jData) {
            loadNeo4jData(options.neo4jData);
        } else if (options.neo4jDataUrl) {
            loadNeo4jDataFromUrl(options.neo4jDataUrl);
        } else {
            console.error('Error: both neo4jData and neo4jDataUrl are empty!');
        }
    }

    function initIconMap() {
        const iconMap = options.iconMap;
        let value;
        Object.keys(iconMap).forEach(key => {
            value = iconMap[key];
            if (value === undefined) {return;}
            key.split(',').forEach(key => {iconMap[key] = value;});
        });
    }

    function initImageMap() {
        let label, property, value, values;
        const {imageMap, images} = options;
        const imageKeysSplit = Object.keys(images).map(x => x.split('|'));

        // Sorting keys with declared depth length in reverse
        imageKeysSplit.sort((a, b) => b.length - a.length);
        imageKeysSplit.forEach(splitValues => {
            [label, property, value] = splitValues;
            values = imageMap[label] || [];
            values.push([property, value, images[splitValues.join('|')]]);
            imageMap[label] = values;
        });
    }

    function initSimulation() {
        return d3.forceSimulation()
                // .velocityDecay(0.8)
                // .force('x', d3.force().strength(0.002))
                // .force('y', d3.force().strength(0.002))
                .force('collide', d3.forceCollide().radius(d => options.minCollision).iterations(2))
                .force('charge', d3.forceManyBody())
                .force('link', d3.forceLink().id(d => d.id))
                .force('center', d3.forceCenter(svg.node().parentElement.parentElement.clientWidth / 2, svg.node().parentElement.parentElement.clientHeight / 2))
                .on('tick', () => tick())
                .on('end', () => {
                    if (options.zoomFit && !justLoaded) {
                        justLoaded = true;
                        zoomFit(2);
                    }
                });
    }

    function loadNeo4jData() {
        nodes = [];
        relationships = [];

        updateWithNeo4jData(options.neo4jData);
    }

    function loadNeo4jDataFromUrl(neo4jDataUrl) {
        nodes = [];
        relationships = [];

        d3.json(neo4jDataUrl, (error, data) => {
            if (error) {
                throw error;
            }

            updateWithNeo4jData(data);
        });
    }

    function neo4jDataToD3Data(data) {
        const graph = {
            nodes: [],
            relationships: []
        };

        data.results.forEach(result => {
            result.data.forEach(data => {
                data.graph.nodes.filter(n => graph.nodes.indexOf(n) === -1)
                                .forEach(node => {graph.nodes.push(node);});

                data.graph.relationships.forEach(r => {
                    r.source = r.startNode;
                    r.target = r.endNode;
                    r.linknum = 1;
                    graph.relationships.push(r);
                });

                data.graph.relationships.sort((a, b) => {
                    if (a.source > b.source) {return 1;}
                    if (a.source < b.source) {return -1;}
                    
                    if (a.target > b.target) {return 1;}
                    if (a.target < b.target) {return -1;}
                    
                    return 0;
                });

                // Link multiplicity check
                data.graph.relationships.filter((_, i) => i !== 0)
                                        .forEach((r, i) => {
                    const r_prev = data.graph.relationships[i];
                    if (r.source === r_prev.source && r.target === r_prev.target) {
                        r.linknum = r_prev.linknum + 1;
                    }
                });
            });
        });

        return graph;
    }

    function randomD3Data(d, maxNodesToGenerate) {
        let data = {
                nodes: [],
                relationships: []
            },
            i,
            label,
            node,
            numNodes = (maxNodesToGenerate * Math.random() << 0) + 1,
            relationship,
            s = size();

        for (i = 0; i < numNodes; i++) {
            label = randomLabel();

            node = {
                id: s.nodes + 1 + i,
                labels: [label],
                properties: {
                    random: label
                },
                x: d.x,
                y: d.y
            };

            data.nodes[data.nodes.length] = node;

            relationship = {
                id: s.relationships + 1 + i,
                type: label.toUpperCase(),
                startNode: d.id,
                endNode: s.nodes + 1 + i,
                properties: {
                    from: Date.now()
                },
                source: d.id,
                target: s.nodes + 1 + i,
                linknum: s.relationships + 1 + i
            };

            data.relationships[data.relationships.length] = relationship;
        }

        return data;
    }

    function randomLabel() {
        const icons = Object.keys(options.iconMap);
        return icons[icons.length * Math.random() << 0];
    }

    function rotate(cx, cy, x, y, angle) {
        let radians = (Math.PI / 180) * angle,
            cos = Math.cos(radians),
            sin = Math.sin(radians),
            nx = (cos * (x - cx)) + (sin * (y - cy)) + cx,
            ny = (cos * (y - cy)) - (sin * (x - cx)) + cy;

        return { x: nx, y: ny };
    }

    function rotatePoint(c, p, angle) {
        return rotate(c.x, c.y, p.x, p.y, angle);
    }

    function rotation(source, target) {
        return Math.atan2(target.y - source.y, target.x - source.x) * 180 / Math.PI;
    }

    function size() {
        return {
            nodes: nodes.length,
            relationships: relationships.length
        };
    }

    function stickNode(d) {
        d.fx = d3.event.x;
        d.fy = d3.event.y;
    }

    function tick() {
        tickNodes();
        tickRelationships();
    }

    function tickNodes() {
        if (node) {
            node.attr('transform', d => `translate(${d.x}, ${d.y})`);
        }
    }

    function tickRelationships() {
        if (!relationship) {return;}

        relationship.attr('transform', d => {
            const angle = rotation(d.source, d.target);
            return `translate(${d.source.x}, ${d.source.y}) rotate(${angle})`;
        });

        tickRelationshipsTexts();
        tickRelationshipsOutlines();
        tickRelationshipsOverlays();
    }

    function tickRelationshipsOutlines() {
        relationship.each(function () {     // This must remain regular function due to the way `this` is used wihin
            let rel = d3.select(this),
                outline = rel.select('.outline'),
                text = rel.select('.text'),
                padding = 3;

            outline.attr('d', d => {
                let center = { x: 0, y: 0 },
                    angle = rotation(d.source, d.target),
                    textBoundingBox = text.node().getBBox(),
                    textPadding = 5,
                    u = unitaryVector(d.source, d.target),
                    textMargin = { x: (d.target.x - d.source.x - (textBoundingBox.width + textPadding) * u.x) * 0.5, y: (d.target.y - d.source.y - (textBoundingBox.width + textPadding) * u.y) * 0.5 },
                    n = unitaryNormalVector(d.source, d.target),
                    rotatedPointA1 = rotatePoint(center, { x: 0 + (options.nodeRadius + 1) * u.x - n.x, y: 0 + (options.nodeRadius + 1) * u.y - n.y }, angle),
                    rotatedPointB1 = rotatePoint(center, { x: textMargin.x - n.x, y: textMargin.y - n.y }, angle),
                    rotatedPointC1 = rotatePoint(center, { x: textMargin.x, y: textMargin.y }, angle),
                    rotatedPointD1 = rotatePoint(center, { x: 0 + (options.nodeRadius + 1) * u.x, y: 0 + (options.nodeRadius + 1) * u.y }, angle),
                    rotatedPointA2 = rotatePoint(center, { x: d.target.x - d.source.x - textMargin.x - n.x, y: d.target.y - d.source.y - textMargin.y - n.y }, angle),
                    rotatedPointB2 = rotatePoint(center, { x: d.target.x - d.source.x - (options.nodeRadius + 1) * u.x - n.x - u.x * options.arrowSize, y: d.target.y - d.source.y - (options.nodeRadius + 1) * u.y - n.y - u.y * options.arrowSize }, angle),
                    rotatedPointC2 = rotatePoint(center, { x: d.target.x - d.source.x - (options.nodeRadius + 1) * u.x - n.x + (n.x - u.x) * options.arrowSize, y: d.target.y - d.source.y - (options.nodeRadius + 1) * u.y - n.y + (n.y - u.y) * options.arrowSize }, angle),
                    rotatedPointD2 = rotatePoint(center, { x: d.target.x - d.source.x - (options.nodeRadius + 1) * u.x, y: d.target.y - d.source.y - (options.nodeRadius + 1) * u.y }, angle),
                    rotatedPointE2 = rotatePoint(center, { x: d.target.x - d.source.x - (options.nodeRadius + 1) * u.x + (- n.x - u.x) * options.arrowSize, y: d.target.y - d.source.y - (options.nodeRadius + 1) * u.y + (- n.y - u.y) * options.arrowSize }, angle),
                    rotatedPointF2 = rotatePoint(center, { x: d.target.x - d.source.x - (options.nodeRadius + 1) * u.x - u.x * options.arrowSize, y: d.target.y - d.source.y - (options.nodeRadius + 1) * u.y - u.y * options.arrowSize }, angle),
                    rotatedPointG2 = rotatePoint(center, { x: d.target.x - d.source.x - textMargin.x, y: d.target.y - d.source.y - textMargin.y }, angle);

                return 'M ' + rotatedPointA1.x + ' ' + rotatedPointA1.y +
                       ' L ' + rotatedPointB1.x + ' ' + rotatedPointB1.y +
                       ' L ' + rotatedPointC1.x + ' ' + rotatedPointC1.y +
                       ' L ' + rotatedPointD1.x + ' ' + rotatedPointD1.y +
                       ' Z M ' + rotatedPointA2.x + ' ' + rotatedPointA2.y +
                       ' L ' + rotatedPointB2.x + ' ' + rotatedPointB2.y +
                       ' L ' + rotatedPointC2.x + ' ' + rotatedPointC2.y +
                       ' L ' + rotatedPointD2.x + ' ' + rotatedPointD2.y +
                       ' L ' + rotatedPointE2.x + ' ' + rotatedPointE2.y +
                       ' L ' + rotatedPointF2.x + ' ' + rotatedPointF2.y +
                       ' L ' + rotatedPointG2.x + ' ' + rotatedPointG2.y +
                       ' Z';
            });
        });
    }

    function tickRelationshipsOverlays() {
        relationshipOverlay.attr('d', d => {
            let center = { x: 0, y: 0 },
                angle = rotation(d.source, d.target),
                n1 = unitaryNormalVector(d.source, d.target),
                n = unitaryNormalVector(d.source, d.target, 50),
                rotatedPointA = rotatePoint(center, { x: 0 - n.x, y: 0 - n.y }, angle),
                rotatedPointB = rotatePoint(center, { x: d.target.x - d.source.x - n.x, y: d.target.y - d.source.y - n.y }, angle),
                rotatedPointC = rotatePoint(center, { x: d.target.x - d.source.x + n.x - n1.x, y: d.target.y - d.source.y + n.y - n1.y }, angle),
                rotatedPointD = rotatePoint(center, { x: 0 + n.x - n1.x, y: 0 + n.y - n1.y }, angle);

            return 'M ' + rotatedPointA.x + ' ' + rotatedPointA.y +
                   ' L ' + rotatedPointB.x + ' ' + rotatedPointB.y +
                   ' L ' + rotatedPointC.x + ' ' + rotatedPointC.y +
                   ' L ' + rotatedPointD.x + ' ' + rotatedPointD.y +
                   ' Z';
        });
    }

    function tickRelationshipsTexts() {
        relationshipText.attr('transform', d => {
            let angle = (rotation(d.source, d.target) + 360) % 360,
                mirror = angle > 90 && angle < 270,
                center = { x: 0, y: 0 },
                n = unitaryNormalVector(d.source, d.target),
                nWeight = mirror ? 2 : -3,
                point = { x: (d.target.x - d.source.x) * 0.5 + n.x * nWeight, y: (d.target.y - d.source.y) * 0.5 + n.y * nWeight },
                rotatedPoint = rotatePoint(center, point, angle);

            return `translate(${rotatedPoint.x}, ${rotatedPoint.y}) rotate(${mirror ? 180 : 0})`;
        });
    }

    function toString(d) {
        const name = [d.labels ? d.labels[0] : d.type];
        const prop_listing = [`<id>: ${d.id}`];

        Object.keys(d.properties).forEach(property => {
            prop_listing.push(`${property}: ${JSON.stringify(d.properties[property])}`);
        });

        return `${name} (${prop_listing.join(', ')})`;
    }

    function unitaryNormalVector(source, target, newLength) {
        let center = { x: 0, y: 0 },
            vector = unitaryVector(source, target, newLength);

        return rotatePoint(center, vector, 90);
    }

    function unitaryVector(source, target, newLength) {
        let length = Math.sqrt(Math.pow(target.x - source.x, 2) + Math.pow(target.y - source.y, 2)) / Math.sqrt(newLength || 1);

        return {
            x: (target.x - source.x) / length,
            y: (target.y - source.y) / length,
        };
    }

    function updateWithD3Data(d3Data) {
        updateNodesAndRelationships(d3Data.nodes, d3Data.relationships);
    }

    function updateWithNeo4jData(neo4jData) {
        const d3Data = neo4jDataToD3Data(neo4jData);
        updateWithD3Data(d3Data);
    }

    function updateInfo(d) {
        clearInfo();

        if (d.labels) {
            appendInfoElementClass('class', d.labels[0]);
        } else {
            appendInfoElementRelationship('class', d.type);
        }

        appendInfoElementProperty('property', '&lt;id&gt;', d.id);

        Object.keys(d.properties).forEach(property => {
            appendInfoElementProperty('property', property, JSON.stringify(d.properties[property]));
        });
    }

    function updateNodes(n) {
        n.forEach(node => {
            node.icon = icon(node);            
            node.image = image(node);
        });

        nodes = Array.prototype.concat(nodes, n);

        node = svgNodes.selectAll('.node')
                       .data(nodes, d => d.id);
        const nodeEnter = appendNodeToGraph();
        node = nodeEnter.merge(node);
    }

    function updateNodesAndRelationships(n, r) {
        updateRelationships(r);
        updateNodes(n);

        simulation.nodes(nodes);
        simulation.force('link').links(relationships);
    }

    function updateRelationships(r) {
        Array.prototype.push.apply(relationships, r);

        relationship = svgRelationships.selectAll('.relationship')
                                       .data(relationships, d => d.id);

        const relationshipEnter = appendRelationshipToGraph();

        relationship = relationshipEnter.relationship.merge(relationship);

        relationshipOutline = svg.selectAll('.relationship .outline');
        relationshipOutline = relationshipEnter.outline.merge(relationshipOutline);

        relationshipOverlay = svg.selectAll('.relationship .overlay');
        relationshipOverlay = relationshipEnter.overlay.merge(relationshipOverlay);

        relationshipText = svg.selectAll('.relationship .text');
        relationshipText = relationshipEnter.text.merge(relationshipText);
    }

    function version() {
        return VERSION;
    }

    function zoomFit() {
        let bounds = svg.node().getBBox(),
            parent = svg.node().parentElement.parentElement,
            fullWidth = parent.clientWidth,
            fullHeight = parent.clientHeight,
            width = bounds.width,
            height = bounds.height,
            midX = bounds.x + width / 2,
            midY = bounds.y + height / 2;

        if (width === 0 || height === 0) {
            return; // nothing to fit
        }

        svgScale = 0.85 / Math.max(width / fullWidth, height / fullHeight);
        svgTranslate_x = fullWidth / 2 - svgScale * midX;
        svgTranslate_y = fullHeight / 2 - svgScale * midY;

        svg.attr('transform', `translate(${svgTranslate_y}, ${svgTranslate_x}) scale(${svgScale})`);
    }

    init(_selector, _options);

    return {
        appendRandomDataToNode: appendRandomDataToNode,
        neo4jDataToD3Data: neo4jDataToD3Data,
        randomD3Data: randomD3Data,
        size: size,
        updateWithD3Data: updateWithD3Data,
        updateWithNeo4jData: updateWithNeo4jData,
        version: version
    };
}

module.exports = Neo4jD3;
