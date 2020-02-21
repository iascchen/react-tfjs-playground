/**
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */

import * as tf from '@tensorflow/tfjs'
import { fetchResource, ITrainDataSet, logger } from '../../utils'

// MNIST data constants:
// const BASE_URL = 'https://storage.googleapis.com/cvdf-datasets/mnist/';
const BASE_URL = '/data'
const TRAIN_IMAGES_FILE = `${BASE_URL}/train-images-idx3-ubyte.gz`
const TRAIN_LABELS_FILE = `${BASE_URL}/train-labels-idx1-ubyte.gz`
const TEST_IMAGES_FILE = `${BASE_URL}/t10k-images-idx3-ubyte.gz`
const TEST_LABELS_FILE = `${BASE_URL}/t10k-labels-idx1-ubyte.gz`

export const IMAGE_HEIGHT = 28
export const IMAGE_WIDTH = 28

const IMAGE_HEADER_BYTES = 16
const IMAGE_FLAT_SIZE = IMAGE_HEIGHT * IMAGE_WIDTH
const LABEL_HEADER_BYTES = 8
const LABEL_RECORD_BYTE = 1
const LABEL_FLAT_SIZE = 10

const loadHeaderValues = (buffer: Buffer, headerLength: number): number[] => {
    const headerValues = []
    for (let i = 0; i < headerLength / 4; i++) {
        // Header data is stored in-order (aka big-endian)
        headerValues[i] = buffer.readUInt32BE(i * 4)
    }
    return headerValues
}

const loadImages = async (url: string): Promise<Float32Array[]> => {
    const buffer = await fetchResource(url, true)

    const headerBytes = IMAGE_HEADER_BYTES
    const recordBytes = IMAGE_FLAT_SIZE

    // skip header
    const headerValues = loadHeaderValues(buffer, headerBytes)
    logger('image header', headerValues)

    const images = []
    let index = headerBytes
    while (index < buffer.byteLength) {
        const array = new Float32Array(recordBytes)
        for (let i = 0; i < recordBytes; i++) {
            // Normalize the pixel values into the 0-1 interval, from
            // the original 0-255 interval.
            array[i] = buffer.readUInt8(index++) / 255.0
        }
        images.push(array)
    }
    logger('Load images :', `${images.length.toString()} / ${headerValues[1].toString()}`)
    return images
}

const loadLabels = async (url: string): Promise<Int32Array[]> => {
    const buffer = await fetchResource(url, true)

    const headerBytes = LABEL_HEADER_BYTES
    const recordBytes = LABEL_RECORD_BYTE

    // skip header
    const headerValues = loadHeaderValues(buffer, headerBytes)
    logger('label header', headerValues)

    const labels = []
    let index = headerBytes
    while (index < buffer.byteLength) {
        const array = new Int32Array(recordBytes)
        for (let i = 0; i < recordBytes; i++) {
            array[i] = buffer.readUInt8(index++)
        }
        labels.push(array)
    }
    logger('Load labels :', `${labels.length.toString()} / ${headerValues[1].toString()}`)
    return labels
}

/** Helper class to handle loading training and test data. */
export class MnistDataset {
    dataset: [Float32Array[], Int32Array[], Float32Array[], Int32Array[]]
    trainSize: number
    testSize: number
    trainBatchIndex: number
    testBatchIndex: number

    constructor () {
        this.dataset = [[], [], [], []]
        this.trainSize = 0
        this.testSize = 0
        this.trainBatchIndex = 0
        this.testBatchIndex = 0
    }

    /** Loads training and test data. */
    loadData = async (): Promise<void> => {
        this.dataset = await Promise.all([
            loadImages(TRAIN_IMAGES_FILE), loadLabels(TRAIN_LABELS_FILE),
            loadImages(TEST_IMAGES_FILE), loadLabels(TEST_LABELS_FILE)
        ])
        this.trainSize = this.dataset[0].length
        this.testSize = this.dataset[2].length
    }

    getTrainData = (): ITrainDataSet => {
        return this.getData_(true)
    }

    getTestData = (): ITrainDataSet => {
        return this.getData_(false)
    }

    getData_ = (isTrainingData: boolean): ITrainDataSet => {
        let imagesIndex: number
        let labelsIndex: number

        if (isTrainingData) {
            imagesIndex = 0
            labelsIndex = 1
        } else {
            imagesIndex = 2
            labelsIndex = 3
        }
        const size = this.dataset[imagesIndex].length

        // Only create one big array to hold batch of images.
        const imagesShape: [number, number, number, number] = [size, IMAGE_HEIGHT, IMAGE_WIDTH, 1]
        const images = new Float32Array(tf.util.sizeFromShape(imagesShape))
        const labels = new Int32Array(tf.util.sizeFromShape([size, 1]))

        let imageOffset = 0
        let labelOffset = 0
        for (let i = 0; i < size; ++i) {
            images.set(this.dataset[imagesIndex][i], imageOffset)
            labels.set(this.dataset[labelsIndex][i], labelOffset)
            imageOffset += IMAGE_FLAT_SIZE
            labelOffset += 1
        }

        return {
            xs: tf.tensor4d(images, imagesShape),
            ys: tf.oneHot(tf.tensor1d(labels, 'int32'), LABEL_FLAT_SIZE).toFloat()
        }
    }
}
